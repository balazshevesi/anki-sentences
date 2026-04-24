import promiseLimit from "promise-limit";
import {
  listSentenceNgramCandidates,
  selectNgramCandidates,
} from "../../deck/ngrams";
import type { PipelineCsvRow } from "../../deck/csv";
import { readPipelineCsvRows, writePipelineCsvRows } from "../../deck/csv";
import type { DeckBuildConfig, DeckRuntimeConfig } from "../../deck/types";
import type { IntegrationContext } from "../../integrations/createIntegrationContext";
import { buildWordByWord } from "../../integrations/ports/index";
import {
  parseCardPayloadJson,
  parseNgramTranslationsJson,
  parseWordByWordJson,
} from "../../contracts/cardPayload";
import { formatDuration } from "../../contracts/formatDuration";

type PromiseLimitFn = <T>(fn: () => Promise<T>) => Promise<T>;

function progressInterval(totalRows: number): number {
  return totalRows <= 10 ? 1 : Math.max(1, Math.ceil(totalRows / 10));
}

function logProgress(
  label: string,
  completedRows: number,
  totalRows: number,
  startedAtMs: number,
): void {
  const elapsedMs = Date.now() - startedAtMs;
  const percentage = ((completedRows / totalRows) * 100).toFixed(1);
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

export async function runTranslationMetadataPass(
  config: DeckBuildConfig,
  csvPath: string,
  runtime: DeckRuntimeConfig,
  integrations: IntegrationContext,
): Promise<PipelineCsvRow[]> {
  const passStartedAt = Date.now();
  const rows = await readPipelineCsvRows(csvPath);
  if (rows.length === 0) {
    console.log(
      `[translations] No rows found in ${csvPath}; skipping enrichment.`,
    );
    return rows;
  }

  console.log(`[translations] Loaded ${rows.length} rows from ${csvPath}.`);
  console.log(
    `[translations] Preparing translation resources (sentence concurrency: ${runtime.sentenceMetadataConcurrency}).`,
  );

  const frequencyLookup = await integrations.wordFrequency.getLookup(
    config.argosSourceLanguage,
  );
  if (!frequencyLookup.sourceFile) {
    console.warn(
      `No frequency list found for '${config.argosSourceLanguage}'. Falling back to default rarity hints.`,
    );
  }

  const translateWord = integrations.translation.createWordTranslator({
    endpoint: config.argosTranslateUrl,
    sourceLanguage: config.argosSourceLanguage,
    targetLanguage: config.argosTargetLanguage,
    alternatives: config.argosAlternatives,
    concurrency: runtime.translationConcurrency,
    getWordFrequencyInfo: frequencyLookup.getWordFrequency,
  });
  const translatePhrase = integrations.translation.createPhraseTranslator({
    endpoint: config.argosTranslateUrl,
    sourceLanguage: config.argosSourceLanguage,
    targetLanguage: config.argosTargetLanguage,
    alternatives: config.argosAlternatives,
    concurrency: runtime.translationConcurrency,
  });

  const candidateMap = selectNgramCandidates(
    rows.map((row) => row.Sentence),
    {
      minCardCount: runtime.ngramMinCardCount,
      minCardPercentage: runtime.ngramMinCardPercentage,
    },
  );

  const sentenceLimit = promiseLimit(
    runtime.sentenceMetadataConcurrency,
  ) as PromiseLimitFn;
  const updateEvery = progressInterval(rows.length);
  const startedAt = Date.now();
  let completed = 0;

  console.log(
    "[translations] Enriching rows with word-by-word and n-gram metadata...",
  );

  const enrichedRows = await Promise.all(
    rows.map((row) =>
      sentenceLimit(async () => {
        const existingCardPayload = parseCardPayloadJson(row.cardPayload);
        const wordByWord = await buildWordByWord(row.Sentence, translateWord);
        const candidates = listSentenceNgramCandidates(
          row.Sentence,
          candidateMap,
          runtime.ngramTranslationLimitPerCard,
        );
        const ngramTranslations =
          candidates.length === 0
            ? "[]"
            : JSON.stringify(
                await Promise.all(
                  candidates.map(async (candidate) => {
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
                ),
              );

        completed += 1;
        if (
          completed === 1 ||
          completed === rows.length ||
          completed % updateEvery === 0
        ) {
          logProgress("translations", completed, rows.length, startedAt);
        }

        return {
          ...row,
          cardPayload: JSON.stringify({
            wordByWord: parseWordByWordJson(wordByWord),
            ngramTranslations: parseNgramTranslationsJson(ngramTranslations),
            audioMetadata: existingCardPayload.audioMetadata,
          }),
        };
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
