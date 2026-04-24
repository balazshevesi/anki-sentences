import { default as Anki } from "anki-apkg-export";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import promiseLimit from "promise-limit";
import {
  buildNgramCandidateMap,
  fetchSentenceJobsForWords,
  formatSentenceTranslation,
  getSentenceTranslations,
} from "./cards";
import { loadQuestionFormatHtml } from "./template";
import {
  createPhraseTranslator,
  createWordTranslator,
  buildWordByWord,
} from "./translate";
import { listSentenceNgramCandidates } from "./ngrams";
import type { DeckBuildConfig, DeckRuntimeConfig, TranslatePhrase } from "./types";
import { loadWordFrequencyLookup } from "../wordFrequencies/index";
import type { PipelineCsvRow } from "./csv";
import { DECK_NOTE_FIELDS, readPipelineCsvRows, writePipelineCsvRows } from "./csv";
import { calculateSentenceDifficultyScore } from "./difficulty";
import {
  createGoogleTtsErrorMetadata,
  generateGoogleTtsAudioMetadata,
  resolveGoogleTtsLanguageCode,
  type GoogleTtsConfig,
} from "../audioGeneration/index";
import {
  EMPTY_CARD_PAYLOAD_JSON,
  parseCardPayloadJson,
  parseNgramTranslationsJson,
  parseWordByWordJson,
} from "../shared/cardPayload";
import { isReadyAudioMetadata } from "../shared/audioMetadata";
import { formatDuration } from "../shared/formatDuration";

type PromiseLimitFn = <T>(fn: () => Promise<T>) => Promise<T>;

function computeTranslationProgressInterval(totalRows: number): number {
  if (totalRows <= 10) {
    return 1;
  }

  return Math.max(1, Math.ceil(totalRows / 10));
}

function logProgress(
  label: string,
  completedRows: number,
  totalRows: number,
  startedAtMs: number,
): void {
  const elapsedMs = Date.now() - startedAtMs;
  const completedRatio = completedRows / totalRows;
  const percentage = (completedRatio * 100).toFixed(1);
  const elapsedSeconds = elapsedMs / 1_000;
  const rowsPerSecond = elapsedSeconds > 0 ? completedRows / elapsedSeconds : 0;
  const remainingRows = totalRows - completedRows;
  const etaMs = rowsPerSecond > 0 ? (remainingRows / rowsPerSecond) * 1_000 : 0;

  const etaText =
    remainingRows > 0 ? `, ETA ${formatDuration(Math.round(etaMs))}` : "";
  console.log(
    `[${label}] Progress ${completedRows}/${totalRows} (${percentage}%) after ${formatDuration(elapsedMs)}${etaText}`,
  );
}

function escapeSqliteStringLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

function neutralizeAnkiMustacheInBundle(value: string): string {
  return value.replaceAll("{{", "{ {");
}

function buildCardPayloadJson(
  wordByWordJson: string,
  ngramTranslationsJson: string,
  audioMetadata: ReturnType<typeof parseCardPayloadJson>["audioMetadata"] = null,
): string {
  return JSON.stringify({
    wordByWord: parseWordByWordJson(wordByWordJson),
    ngramTranslations: parseNgramTranslationsJson(ngramTranslationsJson),
    audioMetadata,
  });
}

async function buildNgramTranslations(
  sentence: string,
  translatePhrase: TranslatePhrase,
  candidateMap: ReturnType<typeof buildNgramCandidateMap>,
  ngramTranslationLimitPerCard: number,
): Promise<string> {
  const sentenceCandidates = listSentenceNgramCandidates(
    sentence,
    candidateMap,
    ngramTranslationLimitPerCard,
  );

  if (sentenceCandidates.length === 0) {
    return "[]";
  }

  const translatedCandidates = await Promise.all(
    sentenceCandidates.map(async (candidate) => {
      const translation = await translatePhrase(candidate.text);
      return {
        phrase: candidate.text,
        ngramLength: candidate.ngramLength,
        translatedText: translation.translatedText,
        alternatives: translation.alternatives,
        occurrenceCount: candidate.occurrenceCount,
        cardCount: candidate.cardCount,
        cardPercentage: candidate.cardPercentage,
      };
    }),
  );

  return JSON.stringify(translatedCandidates);
}

export async function runSentenceRetrievalPass(
  config: DeckBuildConfig,
  csvPath: string,
  runtime: DeckRuntimeConfig,
): Promise<PipelineCsvRow[]> {
  const sentenceJobs = await fetchSentenceJobsForWords(config, {
    wordRetrievalConcurrency: runtime.wordRetrievalConcurrency,
  });
  const rows: PipelineCsvRow[] = sentenceJobs.map((job) => ({
    Sentence: job.sentence.text,
    SentenceTranslation: formatSentenceTranslation(
      getSentenceTranslations(job.sentence, config.sentenceTranslationLimit),
    ),
    Keyword: job.word,
    SentenceId: String(job.sentence.id),
    cardPayload: EMPTY_CARD_PAYLOAD_JSON,
    difficulty: "",
  }));

  await writePipelineCsvRows(csvPath, rows);
  return rows;
}

export async function runTranslationMetadataPass(
  config: DeckBuildConfig,
  csvPath: string,
  runtime: DeckRuntimeConfig,
): Promise<PipelineCsvRow[]> {
  const passStartedAt = Date.now();
  const rows = await readPipelineCsvRows(csvPath);
  if (rows.length === 0) {
    console.log(`[translations] No rows found in ${csvPath}; skipping enrichment.`);
    return rows;
  }

  console.log(`[translations] Loaded ${rows.length} rows from ${csvPath}.`);
  console.log(
    `[translations] Preparing translation resources (sentence concurrency: ${runtime.sentenceMetadataConcurrency}).`,
  );

  const frequencyLookup = await loadWordFrequencyLookup(config.argosSourceLanguage);
  if (!frequencyLookup.sourceFile) {
    console.warn(
      `No frequency list found for '${config.argosSourceLanguage}'. Falling back to default rarity hints.`,
    );
  }

  const translateWord = createWordTranslator({
    endpoint: config.argosTranslateUrl,
    sourceLanguage: config.argosSourceLanguage,
    targetLanguage: config.argosTargetLanguage,
    alternatives: config.argosAlternatives,
    concurrency: runtime.translationConcurrency,
    getWordFrequencyInfo: frequencyLookup.getWordFrequency,
  });
  const translatePhrase = createPhraseTranslator({
    endpoint: config.argosTranslateUrl,
    sourceLanguage: config.argosSourceLanguage,
    targetLanguage: config.argosTargetLanguage,
    alternatives: config.argosAlternatives,
    concurrency: runtime.translationConcurrency,
  });

  const candidateMap = buildNgramCandidateMap(
    rows.map((row) => ({
      word: row.Keyword,
      sentence: {
        id: Number.parseInt(row.SentenceId, 10) || 0,
        text: row.Sentence,
        lang: config.sentenceLanguage,
        script: null,
        license: "CC BY 2.0 FR",
        owner: null,
        is_unapproved: false,
      },
    })),
    {
      minCardCount: runtime.ngramMinCardCount,
      minCardPercentage: runtime.ngramMinCardPercentage,
    },
  );

  const sentenceLimit = promiseLimit(
    runtime.sentenceMetadataConcurrency,
  ) as PromiseLimitFn;

  const totalRows = rows.length;
  const progressInterval = computeTranslationProgressInterval(totalRows);
  const enrichStartedAt = Date.now();
  let completedRows = 0;

  console.log(
    `[translations] Enriching rows with word-by-word and n-gram metadata...`,
  );

  const enrichedRows = await Promise.all(
    rows.map((row) =>
      sentenceLimit(async () => {
        const existingCardPayload = parseCardPayloadJson(row.cardPayload);
        const enrichedRow = {
          ...row,
          cardPayload: buildCardPayloadJson(
            await buildWordByWord(row.Sentence, translateWord),
            await buildNgramTranslations(
              row.Sentence,
              translatePhrase,
              candidateMap,
              runtime.ngramTranslationLimitPerCard,
            ),
            existingCardPayload.audioMetadata,
          ),
        };

        completedRows += 1;
        if (
          completedRows === 1 ||
          completedRows === totalRows ||
          completedRows % progressInterval === 0
        ) {
          logProgress("translations", completedRows, totalRows, enrichStartedAt);
        }

        return enrichedRow;
      }),
    ),
  );

  console.log(`[translations] Writing enriched rows to ${csvPath}...`);
  await writePipelineCsvRows(csvPath, enrichedRows);
  console.log(
    `[translations] Finished translation enrichment in ${formatDuration(Date.now() - passStartedAt)}.`,
  );
  return enrichedRows;
}

function resolveGoogleTtsConfig(config: DeckBuildConfig): GoogleTtsConfig {
  const languageCode =
    config.googleTtsLanguageCode ??
    resolveGoogleTtsLanguageCode(config.sentenceLanguage);
  if (!languageCode) {
    throw new Error(
      `Missing Google Text-to-Speech language code for sentence language '${config.sentenceLanguage}'. Set audio.languageCode in deck.config.jsonc or GOOGLE_TTS_LANGUAGE_CODE.`,
    );
  }

  return {
    accessToken: config.googleTtsAccessToken,
    languageCode,
    voiceName: config.googleTtsVoiceName,
    speakingRate: config.googleTtsSpeakingRate,
    pitch: config.googleTtsPitch,
    audioOutputDir: config.audioOutputDir,
    quotaProject: config.googleCloudQuotaProject,
  };
}

function canReuseReadyAudioMetadata(
  metadata: ReturnType<typeof parseCardPayloadJson>["audioMetadata"],
  googleTtsConfig: GoogleTtsConfig,
): metadata is NonNullable<ReturnType<typeof parseCardPayloadJson>["audioMetadata"]> {
  if (!isReadyAudioMetadata(metadata)) {
    return false;
  }

  return (
    metadata.languageCode === googleTtsConfig.languageCode &&
    metadata.voiceName === (googleTtsConfig.voiceName ?? null) &&
    metadata.speakingRate === googleTtsConfig.speakingRate &&
    metadata.pitch === googleTtsConfig.pitch
  );
}

export async function runAudioMetadataPass(
  config: DeckBuildConfig,
  csvPath: string,
  runtime: DeckRuntimeConfig,
): Promise<PipelineCsvRow[]> {
  const rows = await readPipelineCsvRows(csvPath);
  if (rows.length === 0) {
    console.log(`[audio] No rows found in ${csvPath}; skipping enrichment.`);
    return rows;
  }

  const googleTtsConfig = resolveGoogleTtsConfig(config);
  await mkdir(googleTtsConfig.audioOutputDir, { recursive: true });

  if (config.googleTtsApiKey?.trim()) {
    console.warn(
      "[audio] GOOGLE_TTS_API_KEY is deprecated for this API; OAuth2 credentials are used instead.",
    );
  }

  console.log(
    `[audio] Generating Google TTS audio for ${rows.length} rows (language: ${googleTtsConfig.languageCode}, concurrency: ${runtime.audioMetadataConcurrency}).`,
  );

  const sentenceLimit = promiseLimit(runtime.audioMetadataConcurrency) as PromiseLimitFn;
  const progressInterval = computeTranslationProgressInterval(rows.length);
  const startedAt = Date.now();
  let completedRows = 0;
  let reusedRows = 0;
  let generatedRows = 0;
  let failedRows = 0;

  const enrichedRows = await Promise.all(
    rows.map((row) =>
      sentenceLimit(async () => {
        const existingCardPayload = parseCardPayloadJson(row.cardPayload);
        const existingMetadata = existingCardPayload.audioMetadata;
        const existingAudioFilePath = isReadyAudioMetadata(existingMetadata)
          ? join(googleTtsConfig.audioOutputDir, existingMetadata.audioFileName)
          : null;
        const hasExistingAudioFile = existingAudioFilePath
          ? await Bun.file(existingAudioFilePath).exists()
          : false;

        let nextAudioMetadata = existingMetadata;
        const shouldRegenerate =
          config.audioForceRegenerate ||
          !canReuseReadyAudioMetadata(existingMetadata, googleTtsConfig) ||
          !hasExistingAudioFile;

        if (!shouldRegenerate && existingMetadata) {
          reusedRows += 1;
          nextAudioMetadata = existingMetadata;
        } else {
          try {
            const generatedMetadata = await generateGoogleTtsAudioMetadata(
              row,
              googleTtsConfig,
            );
            generatedRows += 1;
            nextAudioMetadata = generatedMetadata;
          } catch (error) {
            failedRows += 1;
            const errorMessage =
              error instanceof Error ? error.message : `Unknown error: ${String(error)}`;
            nextAudioMetadata = createGoogleTtsErrorMetadata(row.SentenceId, errorMessage);
          }
        }

        completedRows += 1;
        if (
          completedRows === 1 ||
          completedRows === rows.length ||
          completedRows % progressInterval === 0
        ) {
          logProgress("audio", completedRows, rows.length, startedAt);
        }

        return {
          ...row,
          cardPayload: JSON.stringify({
            ...existingCardPayload,
            audioMetadata: nextAudioMetadata,
          }),
        };
      }),
    ),
  );

  await writePipelineCsvRows(csvPath, enrichedRows);
  console.log(
    `[audio] Generated ${generatedRows} row(s), reused ${reusedRows} row(s), failed ${failedRows} row(s).`,
  );
  return enrichedRows;
}

function parseDifficultyValue(rawDifficulty: string): number {
  const parsed = Number.parseFloat(rawDifficulty);
  if (!Number.isFinite(parsed)) {
    return Number.POSITIVE_INFINITY;
  }

  return parsed;
}

export async function runDifficultyPass(
  config: DeckBuildConfig,
  csvPath: string,
): Promise<PipelineCsvRow[]> {
  const rows = await readPipelineCsvRows(csvPath);
  const frequencyLookup = await loadWordFrequencyLookup(config.argosSourceLanguage);
  if (!frequencyLookup.sourceFile) {
    console.warn(
      `No frequency list found for '${config.argosSourceLanguage}'. Falling back to default rarity hints.`,
    );
  }

  const enrichedRows = rows.map((row) => ({
    ...row,
    difficulty: calculateSentenceDifficultyScore(
      row.Sentence,
      frequencyLookup.getWordFrequency,
    ).toFixed(2),
  }));

  const sortedRows = [...enrichedRows].sort((left, right) => {
    const difficultyDelta =
      parseDifficultyValue(left.difficulty) - parseDifficultyValue(right.difficulty);
    if (difficultyDelta !== 0) {
      return difficultyDelta;
    }

    return left.Sentence.localeCompare(right.Sentence);
  });

  await writePipelineCsvRows(csvPath, sortedRows);
  return sortedRows;
}

export async function runBuildApkgPass(
  config: DeckBuildConfig,
  csvPath: string,
  runtime: DeckRuntimeConfig,
): Promise<{ cardCount: number }> {
  const rows = await readPipelineCsvRows(csvPath);
  const questionFormatHtml = neutralizeAnkiMustacheInBundle(
    await loadQuestionFormatHtml(),
  );

  const questionFormat = `
    <div id="front">{{Sentence}}</div>
    <div id="cardPayload" hidden>{{cardPayload}}</div>
    ${questionFormatHtml}`;
  const answerFormat = "{{FrontSide}}<hr id=\"answer\">{{SentenceTranslation}}";

  const deck = new Anki(config.deckName, {
    fields: [...DECK_NOTE_FIELDS],
    questionFormat: escapeSqliteStringLiteral(questionFormat),
    answerFormat: escapeSqliteStringLiteral(answerFormat),
    css: "",
  });

  const includedMediaFiles = new Set<string>();

  for (const row of rows) {
    const parsedCardPayload = parseCardPayloadJson(row.cardPayload);
    const parsedAudioMetadata = parsedCardPayload.audioMetadata;
    if (isReadyAudioMetadata(parsedAudioMetadata)) {
      const mediaFileName = parsedAudioMetadata.audioFileName;
      if (!includedMediaFiles.has(mediaFileName)) {
        const mediaFilePath = join(config.audioOutputDir, mediaFileName);
        const mediaFile = Bun.file(mediaFilePath);
        if (await mediaFile.exists()) {
          deck.addMedia(mediaFileName, await mediaFile.arrayBuffer());
          includedMediaFiles.add(mediaFileName);
        } else {
          console.warn(
            `[build] Missing generated audio file for sentence ${row.SentenceId}: ${mediaFilePath}`,
          );
        }
      }
    }

    deck.addCard(
      row.Sentence,
      row.SentenceTranslation,
      row.Keyword,
      row.SentenceId,
      row.cardPayload,
      row.difficulty,
      {
        sortField: runtime.ankiSortField,
        tags: [
          `sentence_lang_${config.sentenceLanguage}`,
          `translation_lang_${config.translationLanguage}`,
          `keyword_${row.Keyword}`,
        ],
      },
    );
  }

  const apkgBlob = await deck.save();
  await mkdir(dirname(config.outputPath), { recursive: true });
  await Bun.write(config.outputPath, apkgBlob);
  return { cardCount: rows.length };
}
