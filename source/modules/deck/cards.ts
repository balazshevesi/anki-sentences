import {
  DEFAULT_SENTENCE_SEARCH_SORT,
  searchSentences,
} from "../sentenceRetrieval/index";
import promiseLimit from "promise-limit";
import { buildWordByWord } from "./translate";
import type { CardData, DeckBuildConfig, TranslateWord } from "./types";

type PromiseLimitFn = <T>(fn: () => Promise<T>) => Promise<T>;

const DEFAULT_WORD_RETRIEVAL_CONCURRENCY = 1;
const DEFAULT_SENTENCE_PROCESS_CONCURRENCY = 1;

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

export async function getCardsForWords(
  config: DeckBuildConfig,
  translateWord: TranslateWord,
): Promise<CardData[]> {
  const wordLimit = promiseLimit(WORD_RETRIEVAL_CONCURRENCY) as PromiseLimitFn;

  const cardsByWord = await Promise.all(
    config.words.map((word) =>
      wordLimit(async (): Promise<CardData[]> => {
        const response = await searchSentences({
          lang: config.sentenceLanguage,
          "trans:lang": config.translationLanguage,
          sort: DEFAULT_SENTENCE_SEARCH_SORT,
          q: word,
          word_count: config.sentenceWordCount,
          limit: config.sentenceLimit,
        });

        const sentenceLimit = promiseLimit(
          SENTENCE_PROCESS_CONCURRENCY,
        ) as PromiseLimitFn;
        return Promise.all(
          response.data.map((sentence) =>
            sentenceLimit(async (): Promise<CardData> => {
              const translation =
                sentence.translations?.[0]?.text ?? "(no translation)";
              const wordByWord = await buildWordByWord(
                sentence.text,
                translateWord,
              );

              return {
                sentence: sentence.text,
                translation,
                keyword: word,
                sentenceId: String(sentence.id),
                wordByWord,
              };
            }),
          ),
        );
      }),
    ),
  );

  return cardsByWord.flat();
}
