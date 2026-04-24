import promiseLimit from "promise-limit";
import {
  DEFAULT_SENTENCE_SEARCH_SORT,
  searchSentences,
  type SentenceWithTranslations,
} from "../sentenceRetrieval/index";
import { selectNgramCandidates } from "./ngrams";
import type { DeckBuildConfig } from "./types";

type PromiseLimitFn = <T>(fn: () => Promise<T>) => Promise<T>;

export type SentenceJob = {
  word: string;
  sentence: SentenceWithTranslations;
};

type SearchSentencesFn = (
  params: Parameters<typeof searchSentences>[0],
) => ReturnType<typeof searchSentences>;

type NgramThresholdOptions = {
  minCardCount: number;
  minCardPercentage: number;
};

function parsePositiveInteger(
  rawValue: number,
  optionName: string,
): number {
  if (!Number.isSafeInteger(rawValue) || rawValue <= 0) {
    throw new Error(
      `${optionName} must be a positive integer. Received: ${rawValue}`,
    );
  }

  return rawValue;
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildSentenceExclusionPatterns(terms: string[]): RegExp[] {
  return terms
    .map((term) => term.trim().toLocaleLowerCase())
    .filter((term) => term.length > 0)
    .map((term) =>
      new RegExp(
        `(^|[^\\p{L}\\p{N}])${escapeForRegex(term)}(?=$|[^\\p{L}\\p{N}])`,
        "iu",
      )
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
  sentence: { translations?: Array<{ text: string }> },
  maxTranslations: number,
): string[] {
  const uniqueTranslations: string[] = [];
  const seenTranslations = new Set<string>();

  for (const translation of sentence.translations ?? []) {
    const normalizedText = translation.text.trim();
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

export function normalizeSentenceTextForDedupe(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function dedupeSentenceJobs(sentenceJobs: SentenceJob[]): SentenceJob[] {
  const uniqueSentenceJobs: SentenceJob[] = [];
  const seenSentenceIds = new Set<number>();
  const seenSentenceTexts = new Set<string>();

  for (const sentenceJob of sentenceJobs) {
    const normalizedText = normalizeSentenceTextForDedupe(sentenceJob.sentence.text);

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
    searchSentencesFn?: SearchSentencesFn;
    wordRetrievalConcurrency: number;
  },
): Promise<SentenceJob[]> {
  const wordRetrievalConcurrency = parsePositiveInteger(
    options.wordRetrievalConcurrency,
    "wordRetrievalConcurrency",
  );
  const wordLimit = promiseLimit(wordRetrievalConcurrency) as PromiseLimitFn;
  const searchSentencesFn = options.searchSentencesFn ?? searchSentences;
  const sentenceExclusionPatterns = buildSentenceExclusionPatterns(
    config.sentenceExclusions,
  );

  const wordResponses = await Promise.all(
    config.words.map((word) =>
      wordLimit(async () => ({
        word,
        response: await searchSentencesFn({
          lang: config.sentenceLanguage,
          "trans:lang": config.translationLanguage,
          sort: DEFAULT_SENTENCE_SEARCH_SORT,
          q: word,
          word_count: config.sentenceWordCount,
          limit: config.sentenceLimit,
        }),
      })),
    ),
  );

  return dedupeSentenceJobs(
    wordResponses.flatMap(({ word, response }) =>
      response.data
        .filter(
          (sentence) =>
            !shouldExcludeSentence(sentence.text, sentenceExclusionPatterns),
        )
        .map((sentence) => ({ word, sentence })),
    ),
  );
}

export function buildNgramCandidateMap(
  sentenceJobs: SentenceJob[],
  thresholds: NgramThresholdOptions,
): ReturnType<typeof selectNgramCandidates> {
  return selectNgramCandidates(
    sentenceJobs.map((job) => job.sentence.text),
    {
      minCardCount: thresholds.minCardCount,
      minCardPercentage: thresholds.minCardPercentage,
    },
  );
}
