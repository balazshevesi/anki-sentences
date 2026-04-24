import promiseLimit from "promise-limit";
import type { DeckBuildConfig } from "./types";
import type {
  SentenceSearchResult,
  SentenceSourcePort,
} from "../integrations/ports/index";

type PromiseLimitFn = <T>(fn: () => Promise<T>) => Promise<T>;

export type SentenceJob = {
  word: string;
  sentence: SentenceSearchResult;
};

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSentenceExclusionPatterns(terms: string[]): RegExp[] {
  return terms
    .map((term) => term.trim().toLocaleLowerCase())
    .filter((term) => term.length > 0)
    .map(
      (term) =>
        new RegExp(
          `(^|[^\\p{L}\\p{N}])${escapeForRegex(term)}(?=$|[^\\p{L}\\p{N}])`,
          "iu",
        ),
    );
}

function shouldExcludeSentence(text: string, patterns: RegExp[]): boolean {
  if (patterns.length === 0) {
    return false;
  }

  const normalizedText = text.trim().toLocaleLowerCase();
  return patterns.some((pattern) => pattern.test(normalizedText));
}

export function getSentenceTranslations(
  sentence: { translations?: string[] },
  maxTranslations: number,
): string[] {
  const uniqueTranslations: string[] = [];
  const seenTranslations = new Set<string>();

  for (const translation of sentence.translations ?? []) {
    const normalizedText = translation.trim();
    if (normalizedText.length === 0) {
      continue;
    }

    const dedupeKey = normalizedText.toLocaleLowerCase();
    if (seenTranslations.has(dedupeKey)) {
      continue;
    }

    seenTranslations.add(dedupeKey);
    uniqueTranslations.push(normalizedText);
    if (uniqueTranslations.length >= maxTranslations) {
      break;
    }
  }

  return uniqueTranslations;
}

export function formatSentenceTranslation(translations: string[]): string {
  if (translations.length === 0) {
    return "(no translation)";
  }

  return translations.join("<br>");
}

function normalizeSentenceTextForDedupe(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function dedupeSentenceJobs(sentenceJobs: SentenceJob[]): SentenceJob[] {
  const uniqueSentenceJobs: SentenceJob[] = [];
  const seenSentenceIds = new Set<string>();
  const seenSentenceTexts = new Set<string>();

  for (const sentenceJob of sentenceJobs) {
    const normalizedText = normalizeSentenceTextForDedupe(
      sentenceJob.sentence.text,
    );

    if (
      seenSentenceIds.has(sentenceJob.sentence.id) ||
      seenSentenceTexts.has(normalizedText)
    ) {
      continue;
    }

    seenSentenceIds.add(sentenceJob.sentence.id);
    seenSentenceTexts.add(normalizedText);
    uniqueSentenceJobs.push(sentenceJob);
  }

  return uniqueSentenceJobs;
}

export async function fetchSentenceJobsForWords(
  config: DeckBuildConfig,
  options: {
    sentenceSource: SentenceSourcePort;
    wordRetrievalConcurrency: number;
  },
): Promise<SentenceJob[]> {
  const wordRetrievalConcurrency = options.wordRetrievalConcurrency;
  if (
    !Number.isSafeInteger(wordRetrievalConcurrency) ||
    wordRetrievalConcurrency <= 0
  ) {
    throw new Error(
      `wordRetrievalConcurrency must be a positive integer. Received: ${wordRetrievalConcurrency}`,
    );
  }
  const wordLimit = promiseLimit(wordRetrievalConcurrency) as PromiseLimitFn;
  const sentenceSource = options.sentenceSource;
  const sentenceExclusionPatterns = buildSentenceExclusionPatterns(
    config.sentenceExclusions,
  );

  const wordResponses = await Promise.all(
    config.words.map((word) =>
      wordLimit(async () => ({
        word,
        response: await sentenceSource.searchByKeyword({
          sourceLanguage: config.sentenceLanguage,
          translationLanguage: config.translationLanguage,
          keyword: word,
          wordCount: config.sentenceWordCount,
          limit: config.sentenceLimit,
        }),
      })),
    ),
  );

  return dedupeSentenceJobs(
    wordResponses.flatMap(({ word, response }) =>
      response
        .filter(
          (sentence) =>
            !shouldExcludeSentence(sentence.text, sentenceExclusionPatterns),
        )
        .map((sentence) => ({ word, sentence })),
    ),
  );
}
