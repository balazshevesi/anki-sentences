import promiseLimit from "promise-limit";
import {
  DEFAULT_SENTENCE_SEARCH_SORT,
  searchSentences,
  type SentenceWithTranslations,
} from "../sentenceRetrieval/index";
import {
  listSentenceNgramCandidates,
  selectNgramCandidates,
} from "./ngrams";
import { buildWordByWord } from "./translate";
import type {
  CardData,
  DeckBuildConfig,
  TranslatePhrase,
  TranslateWord,
} from "./types";

type PromiseLimitFn = <T>(fn: () => Promise<T>) => Promise<T>;

const DEFAULT_WORD_RETRIEVAL_CONCURRENCY = 1;
const DEFAULT_SENTENCE_PROCESS_CONCURRENCY = 1;
const DEFAULT_NGRAM_MIN_CARD_COUNT = 2;
const DEFAULT_NGRAM_MIN_CARD_PERCENTAGE = 3;
const DEFAULT_NGRAM_TRANSLATION_LIMIT_PER_CARD = 6;

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

type CardsForWordsOptions = {
  searchSentencesFn?: SearchSentencesFn;
  ngramThresholds?: NgramThresholdOptions;
  wordRetrievalConcurrency?: number;
  sentenceProcessConcurrency?: number;
  ngramTranslationLimitPerCard?: number;
};

type CardBuildDependencies = {
  translateWord: TranslateWord;
  translatePhrase: TranslatePhrase;
  candidateMap: ReturnType<typeof selectNgramCandidates>;
};

function parseConcurrency(
  rawValue: number | undefined,
  optionName: string,
  defaultValue: number,
): number {
  if (rawValue === undefined) {
    return defaultValue;
  }

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
    const normalizedText = normalizeSentenceTextForDedupe(
      sentenceJob.sentence.text,
    );

    if (
      seenSentenceIds.has(sentenceJob.sentence.id)
      || seenSentenceTexts.has(normalizedText)
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
  options: Pick<
    CardsForWordsOptions,
    "searchSentencesFn" | "wordRetrievalConcurrency"
  > = {},
): Promise<SentenceJob[]> {
  const wordRetrievalConcurrency = parseConcurrency(
    options.wordRetrievalConcurrency,
    "wordRetrievalConcurrency",
    DEFAULT_WORD_RETRIEVAL_CONCURRENCY,
  );
  const wordLimit = promiseLimit(wordRetrievalConcurrency) as PromiseLimitFn;
  const searchSentencesFn = options.searchSentencesFn ?? searchSentences;
  const sentenceExclusionPatterns = buildSentenceExclusionPatterns(
    config.sentenceExclusions,
  );

  const wordResponses = await Promise.all(
    config.words.map((word) =>
      wordLimit(async () => {
        const response = await searchSentencesFn({
          lang: config.sentenceLanguage,
          "trans:lang": config.translationLanguage,
          sort: DEFAULT_SENTENCE_SEARCH_SORT,
          q: word,
          word_count: config.sentenceWordCount,
          limit: config.sentenceLimit,
        });

        return {
          word,
          response,
        };
      }),
    ),
  );

  return dedupeSentenceJobs(
    wordResponses.flatMap(({ word, response }) =>
      response.data
        .filter(
          (sentence) =>
            !shouldExcludeSentence(sentence.text, sentenceExclusionPatterns),
        )
        .map((sentence) => ({
          word,
          sentence,
        })),
    ),
  );
}

export function buildNgramCandidateMap(
  sentenceJobs: SentenceJob[],
  thresholds: NgramThresholdOptions = {
    minCardCount: DEFAULT_NGRAM_MIN_CARD_COUNT,
    minCardPercentage: DEFAULT_NGRAM_MIN_CARD_PERCENTAGE,
  },
): ReturnType<typeof selectNgramCandidates> {
  return selectNgramCandidates(
    sentenceJobs.map((job) => job.sentence.text),
    {
      minCardCount: thresholds.minCardCount,
      minCardPercentage: thresholds.minCardPercentage,
    },
  );
}

async function buildNgramTranslations(
  sentence: string,
  translatePhrase: TranslatePhrase,
  candidateMap: ReturnType<typeof selectNgramCandidates>,
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

export async function buildCardFromSentenceJob(
  sentenceJob: SentenceJob,
  config: DeckBuildConfig,
  dependencies: CardBuildDependencies,
  options: Pick<CardsForWordsOptions, "ngramTranslationLimitPerCard"> = {},
): Promise<CardData> {
  const ngramTranslationLimitPerCard = parseConcurrency(
    options.ngramTranslationLimitPerCard,
    "ngramTranslationLimitPerCard",
    DEFAULT_NGRAM_TRANSLATION_LIMIT_PER_CARD,
  );
  const translation = formatSentenceTranslation(
    getSentenceTranslations(
      sentenceJob.sentence,
      config.sentenceTranslationLimit,
    ),
  );
  const wordByWord = await buildWordByWord(
    sentenceJob.sentence.text,
    dependencies.translateWord,
  );
  const ngramTranslations = await buildNgramTranslations(
    sentenceJob.sentence.text,
    dependencies.translatePhrase,
    dependencies.candidateMap,
    ngramTranslationLimitPerCard,
  );

  return {
    sentence: sentenceJob.sentence.text,
    translation,
    keyword: sentenceJob.word,
    sentenceId: String(sentenceJob.sentence.id),
    wordByWord,
    ngramTranslations,
  };
}

export async function getCardsForWords(
  config: DeckBuildConfig,
  translateWord: TranslateWord,
  translatePhrase: TranslatePhrase,
  options: CardsForWordsOptions = {},
): Promise<CardData[]> {
  const sentenceProcessConcurrency = parseConcurrency(
    options.sentenceProcessConcurrency,
    "sentenceProcessConcurrency",
    DEFAULT_SENTENCE_PROCESS_CONCURRENCY,
  );
  const sentenceJobs = await fetchSentenceJobsForWords(config, {
    searchSentencesFn: options.searchSentencesFn,
    wordRetrievalConcurrency: options.wordRetrievalConcurrency,
  });

  const candidateMap = buildNgramCandidateMap(
    sentenceJobs,
    options.ngramThresholds,
  );

  const sentenceLimit = promiseLimit(
    sentenceProcessConcurrency,
  ) as PromiseLimitFn;

  return await Promise.all(
    sentenceJobs.map((job) =>
      sentenceLimit(async (): Promise<CardData> =>
        buildCardFromSentenceJob(job, config, {
          translateWord,
          translatePhrase,
          candidateMap,
        }, {
          ngramTranslationLimitPerCard: options.ngramTranslationLimitPerCard,
        }),
      ),
    ),
  );
}
