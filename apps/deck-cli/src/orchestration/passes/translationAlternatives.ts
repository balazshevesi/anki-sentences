import promiseLimit from "promise-limit";
import type { PipelineCsvRow } from "../../deck/csv";
import { readPipelineCsvRows, writePipelineCsvRows } from "../../deck/csv";
import type { DeckBuildConfig, DeckRuntimeConfig } from "../../deck/types";
import type {
  NgramTranslation,
  WordTranslation,
} from "../../contracts/cardPayload";
import { parseCardPayloadJson } from "../../contracts/cardPayload";
import { formatDuration } from "../../contracts/formatDuration";
import { createArgosTranslationAdapter } from "../../integrations/argosTranslate/argosTranslationAdapter";
import type {
  PhraseTranslation,
  TranslatePhrase,
} from "../../integrations/ports";

type PromiseLimitFn = <T>(fn: () => Promise<T>) => Promise<T>;

function normalizeTranslation(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function dedupeAlternatives(
  translatedText: string,
  alternatives: string[],
): string[] {
  const seen = new Set<string>();
  const mainTranslationKey = normalizeTranslation(translatedText);
  if (mainTranslationKey.length > 0) {
    seen.add(mainTranslationKey);
  }

  const deduped: string[] = [];
  for (const alternative of alternatives) {
    const normalizedAlternative = alternative.trim().replace(/\s+/g, " ");
    const dedupeKey = normalizeTranslation(normalizedAlternative);
    if (dedupeKey.length === 0 || seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    deduped.push(normalizedAlternative);
  }

  return deduped;
}

function mergeArgosAlternatives(
  translatedText: string,
  existingAlternatives: string[],
  argosTranslation: PhraseTranslation,
): string[] {
  return dedupeAlternatives(translatedText, [
    ...existingAlternatives,
    argosTranslation.translatedText,
    ...argosTranslation.alternatives,
  ]);
}

async function enrichWordAlternatives(
  word: string,
  translation: WordTranslation,
  translatePhrase: TranslatePhrase,
): Promise<WordTranslation> {
  const existingAlternatives = dedupeAlternatives(
    translation.translatedText,
    translation.alternatives,
  );
  if (existingAlternatives.length > 0) {
    return {
      ...translation,
      alternatives: existingAlternatives,
    };
  }

  const argosTranslation = await translatePhrase(word);
  return {
    ...translation,
    alternatives: mergeArgosAlternatives(
      translation.translatedText,
      existingAlternatives,
      argosTranslation,
    ),
  };
}

async function enrichNgramAlternatives(
  ngramTranslation: NgramTranslation,
  translatePhrase: TranslatePhrase,
): Promise<NgramTranslation> {
  const existingAlternatives = dedupeAlternatives(
    ngramTranslation.translatedText,
    ngramTranslation.alternatives,
  );
  if (existingAlternatives.length > 0) {
    return {
      ...ngramTranslation,
      alternatives: existingAlternatives,
    };
  }

  const argosTranslation = await translatePhrase(ngramTranslation.phrase);
  return {
    ...ngramTranslation,
    alternatives: mergeArgosAlternatives(
      ngramTranslation.translatedText,
      existingAlternatives,
      argosTranslation,
    ),
  };
}

export async function runTranslationAlternativesPass(
  config: DeckBuildConfig,
  csvPath: string,
  runtime: DeckRuntimeConfig,
): Promise<PipelineCsvRow[]> {
  const passStartedAt = Date.now();
  const rows = await readPipelineCsvRows(csvPath);
  if (rows.length === 0) {
    console.log(
      `[translation-alternatives] No rows found in ${csvPath}; skipping enrichment.`,
    );
    return rows;
  }

  const translatePhrase =
    createArgosTranslationAdapter().createPhraseTranslator({
      endpoint: config.argosTranslateUrl,
      sourceLanguage: config.translationSourceLanguage,
      targetLanguage: config.translationTargetLanguage,
      alternatives: config.argosAlternatives,
      concurrency: runtime.translationConcurrency,
      cachePath: config.argosTranslationCachePath,
    });
  const rowLimit = promiseLimit(
    runtime.sentenceMetadataConcurrency,
  ) as PromiseLimitFn;

  console.log(
    `[translation-alternatives] Enriching missing alternatives for ${rows.length} rows with Argos...`,
  );

  const enrichedRows = await Promise.all(
    rows.map((row) =>
      rowLimit(async () => {
        const existingCardPayload = parseCardPayloadJson(row.cardPayload);
        const wordByWordEntries = await Promise.all(
          Object.entries(existingCardPayload.wordByWord).map(
            async ([word, translation]) =>
              [
                word,
                await enrichWordAlternatives(
                  word,
                  translation,
                  translatePhrase,
                ),
              ] as const,
          ),
        );
        const ngramTranslations = await Promise.all(
          existingCardPayload.ngramTranslations.map((ngramTranslation) =>
            enrichNgramAlternatives(ngramTranslation, translatePhrase),
          ),
        );
        const wordByWord = Object.fromEntries(
          wordByWordEntries.map(([word, translation]) => [
            word,
            {
              translatedText: translation.translatedText,
              alternatives: translation.alternatives,
            },
          ]),
        );

        return {
          ...row,
          cardPayload: JSON.stringify({
            wordByWord,
            ngramTranslations,
            audioMetadata: existingCardPayload.audioMetadata,
          }),
        };
      }),
    ),
  );

  console.log(
    `[translation-alternatives] Writing enriched rows to ${csvPath}...`,
  );
  await writePipelineCsvRows(csvPath, enrichedRows);
  console.log(
    `[translation-alternatives] Finished alternatives enrichment in ${formatDuration(Date.now() - passStartedAt)}.`,
  );

  return enrichedRows;
}
