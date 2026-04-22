import {
  DEFAULT_SENTENCE_SEARCH_SORT,
  searchSentences,
} from "../sentenceRetrieval/index";
import promiseLimit from "promise-limit";
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

function getSentenceTranslations(
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

function formatSentenceTranslation(translations: string[]): string {
  if (translations.length === 0) {
    return "(no translation)";
  }

  return translations.join("<br>");
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

export async function getCardsForWords(
  config: DeckBuildConfig,
  translateWord: TranslateWord,
  translatePhrase: TranslatePhrase,
): Promise<CardData[]> {
  const wordLimit = promiseLimit(WORD_RETRIEVAL_CONCURRENCY) as PromiseLimitFn;

  const wordResponses = await Promise.all(
    config.words.map((word) =>
      wordLimit(async () => {
        const response = await searchSentences({
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

  const sentenceJobs = wordResponses.flatMap(({ word, response }) =>
    response.data.map((sentence) => ({
      word,
      sentence,
    })),
  );

  const candidateMap = selectNgramCandidates(
    sentenceJobs.map((job) => job.sentence.text),
    {
      minCardCount: DEFAULT_NGRAM_MIN_CARD_COUNT,
      minCardPercentage: DEFAULT_NGRAM_MIN_CARD_PERCENTAGE,
    },
  );

  const sentenceLimit = promiseLimit(
    SENTENCE_PROCESS_CONCURRENCY,
  ) as PromiseLimitFn;

  const cards = await Promise.all(
    sentenceJobs.map((job) =>
      sentenceLimit(async (): Promise<CardData> => {
        const translation = formatSentenceTranslation(
          getSentenceTranslations(
            job.sentence,
            config.sentenceTranslationLimit,
          ),
        );
        const wordByWord = await buildWordByWord(
          job.sentence.text,
          translateWord,
        );
        const ngramTranslations = await buildNgramTranslations(
          job.sentence.text,
          translatePhrase,
          candidateMap,
        );

        return {
          sentence: job.sentence.text,
          translation,
          keyword: job.word,
          sentenceId: String(job.sentence.id),
          wordByWord,
          ngramTranslations,
        };
      }),
    ),
  );

  return cards;
}
