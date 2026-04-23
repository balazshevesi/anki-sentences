import { default as Anki } from "anki-apkg-export";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import promiseLimit from "promise-limit";
import {
  buildNgramCandidateMap,
  fetchSentenceJobsForWords,
  formatSentenceTranslation,
  getSentenceTranslations,
} from "./cards";
import { DEFAULT_DECK_SORT_FIELD, DECK_NOTE_FIELDS } from "./constants";
import { loadQuestionFormatHtml } from "./template";
import {
  createPhraseTranslator,
  createWordTranslator,
  buildWordByWord,
} from "./translate";
import { listSentenceNgramCandidates } from "./ngrams";
import type { DeckBuildConfig, TranslatePhrase } from "./types";
import { loadWordFrequencyLookup } from "../wordFrequencies/index";
import type { PipelineCsvRow } from "./csv";
import { readPipelineCsvRows, writePipelineCsvRows } from "./csv";
import { calculateSentenceDifficultyScore } from "./difficulty";

type PromiseLimitFn = <T>(fn: () => Promise<T>) => Promise<T>;

const DEFAULT_NGRAM_TRANSLATION_LIMIT_PER_CARD = 6;
const DEFAULT_SENTENCE_METADATA_CONCURRENCY = 1;

function parsePositiveInteger(
  rawValue: string | undefined,
  optionName: string,
  defaultValue: number,
): number {
  if (rawValue === undefined) {
    return defaultValue;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(
      `${optionName} must be a positive integer. Received: ${rawValue}`,
    );
  }

  return parsed;
}

const SENTENCE_METADATA_CONCURRENCY = parsePositiveInteger(
  Bun.env.DECK_SENTENCE_CONCURRENCY,
  "DECK_SENTENCE_CONCURRENCY",
  DEFAULT_SENTENCE_METADATA_CONCURRENCY,
);

function escapeSqliteStringLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

function neutralizeAnkiMustacheInBundle(value: string): string {
  return value.replaceAll("{{", "{ {");
}

async function buildNgramTranslations(
  sentence: string,
  translatePhrase: TranslatePhrase,
  candidateMap: ReturnType<typeof buildNgramCandidateMap>,
): Promise<string> {
  const sentenceCandidates = listSentenceNgramCandidates(
    sentence,
    candidateMap,
    DEFAULT_NGRAM_TRANSLATION_LIMIT_PER_CARD,
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
): Promise<PipelineCsvRow[]> {
  const sentenceJobs = await fetchSentenceJobsForWords(config);
  const rows: PipelineCsvRow[] = sentenceJobs.map((job) => ({
    Sentence: job.sentence.text,
    SentenceTranslation: formatSentenceTranslation(
      getSentenceTranslations(job.sentence, config.sentenceTranslationLimit),
    ),
    Keyword: job.word,
    SentenceId: String(job.sentence.id),
    wordByWord: "{}",
    ngramTranslations: "[]",
    difficulty: "",
    audioMetadata: "[]",
  }));

  await writePipelineCsvRows(csvPath, rows);
  return rows;
}

export async function runTranslationMetadataPass(
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

  const translateWord = createWordTranslator({
    endpoint: config.argosTranslateUrl,
    sourceLanguage: config.argosSourceLanguage,
    targetLanguage: config.argosTargetLanguage,
    alternatives: config.argosAlternatives,
    getWordFrequencyInfo: frequencyLookup.getWordFrequency,
  });
  const translatePhrase = createPhraseTranslator({
    endpoint: config.argosTranslateUrl,
    sourceLanguage: config.argosSourceLanguage,
    targetLanguage: config.argosTargetLanguage,
    alternatives: config.argosAlternatives,
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
  );

  const sentenceLimit = promiseLimit(
    SENTENCE_METADATA_CONCURRENCY,
  ) as PromiseLimitFn;

  const enrichedRows = await Promise.all(
    rows.map((row) =>
      sentenceLimit(async () => ({
        ...row,
        wordByWord: await buildWordByWord(row.Sentence, translateWord),
        ngramTranslations: await buildNgramTranslations(
          row.Sentence,
          translatePhrase,
          candidateMap,
        ),
      })),
    ),
  );

  await writePipelineCsvRows(csvPath, enrichedRows);
  return enrichedRows;
}

export async function runAudioMetadataPass(
  csvPath: string,
): Promise<PipelineCsvRow[]> {
  const rows = await readPipelineCsvRows(csvPath);

  const enrichedRows = rows.map((row) => ({
    ...row,
    audioMetadata:
      row.audioMetadata.trim().length > 0
        ? row.audioMetadata
        : JSON.stringify({
          status: "not_implemented",
          sentenceId: row.SentenceId,
        }),
  }));

  await writePipelineCsvRows(csvPath, enrichedRows);
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
): Promise<{ cardCount: number }> {
  const rows = await readPipelineCsvRows(csvPath);
  const questionFormatHtml = neutralizeAnkiMustacheInBundle(
    await loadQuestionFormatHtml(),
  );

  const questionFormat = `
    <div id="front">{{Sentence}}</div>
    <div id="wordByWord" hidden>{{wordByWord}}</div>
    <div id="ngramTranslations" hidden>{{ngramTranslations}}</div>
    ${questionFormatHtml}`;
  const answerFormat = "{{FrontSide}}<hr id=\"answer\">{{SentenceTranslation}}";

  const deck = new Anki(config.deckName, {
    fields: [...DECK_NOTE_FIELDS],
    questionFormat: escapeSqliteStringLiteral(questionFormat),
    answerFormat: escapeSqliteStringLiteral(answerFormat),
    css: "",
  });

  for (const row of rows) {
    deck.addCard(
      row.Sentence,
      row.SentenceTranslation,
      row.Keyword,
      row.SentenceId,
      row.wordByWord,
      row.ngramTranslations,
      row.difficulty,
      {
        sortField: DEFAULT_DECK_SORT_FIELD,
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
