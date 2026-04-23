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
};

type CardBuildDependencies = {
  translateWord: TranslateWord;
  translatePhrase: TranslatePhrase;
  candidateMap: ReturnType<typeof selectNgramCandidates>;
};

function parseConcurrency(
  rawValue: string | undefined,
  optionName: string,
  defaultValue: number,
): number {
  if (rawValue === undefined) {
    return defaultValue;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(
      `${optionName} must be a positive integer. Received: ${rawValue}`,
    );
  }

  return parsedValue;
}

const WORD_RETRIEVAL_CONCURRENCY = parseConcurrency(
  Bun.env.DECK_WORD_CONCURRENCY,
  "DECK_WORD_CONCURRENCY",
  DEFAULT_WORD_RETRIEVAL_CONCURRENCY,
);

const SENTENCE_PROCESS_CONCURRENCY = parseConcurrency(
  Bun.env.DECK_SENTENCE_CONCURRENCY,
  "DECK_SENTENCE_CONCURRENCY",
  DEFAULT_SENTENCE_PROCESS_CONCURRENCY,
);

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
  options: Pick<CardsForWordsOptions, "searchSentencesFn"> = {},
): Promise<SentenceJob[]> {
  const wordLimit = promiseLimit(WORD_RETRIEVAL_CONCURRENCY) as PromiseLimitFn;
  const searchSentencesFn = options.searchSentencesFn ?? searchSentences;

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
      response.data.map((sentence) => ({
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

export async function buildCardFromSentenceJob(
  sentenceJob: SentenceJob,
  config: DeckBuildConfig,
  dependencies: CardBuildDependencies,
): Promise<CardData> {
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
  const sentenceJobs = await fetchSentenceJobsForWords(config, {
    searchSentencesFn: options.searchSentencesFn,
  });

  const candidateMap = buildNgramCandidateMap(
    sentenceJobs,
    options.ngramThresholds,
  );

  const sentenceLimit = promiseLimit(
    SENTENCE_PROCESS_CONCURRENCY,
  ) as PromiseLimitFn;

  return await Promise.all(
    sentenceJobs.map((job) =>
      sentenceLimit(async (): Promise<CardData> =>
        buildCardFromSentenceJob(job, config, {
          translateWord,
          translatePhrase,
          candidateMap,
        }),
      ),
    ),
  );
}
