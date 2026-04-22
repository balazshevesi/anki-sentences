import type { TranslateWord } from "./types";
import promiseLimit from "promise-limit";

type PromiseLimitFn = <T>(fn: () => Promise<T>) => Promise<T>;

type ArgosTranslateRequest = {
  q: string;
  source: string;
  target: string;
};

type ArgosTranslateResponse = {
  translatedText?: string;
};

const DEFAULT_TRANSLATION_CONCURRENCY = 1;

function parseTranslationConcurrency(rawValue: string | undefined): number {
  if (rawValue === undefined) {
    return DEFAULT_TRANSLATION_CONCURRENCY;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(
      `DECK_TRANSLATION_CONCURRENCY must be a positive integer. Received: ${rawValue}`,
    );
  }

  return parsedValue;
}

const TRANSLATION_CONCURRENCY = parseTranslationConcurrency(
  Bun.env.DECK_TRANSLATION_CONCURRENCY,
);

export function createWordTranslator(options: {
  endpoint: string;
  sourceLanguage: string;
  targetLanguage: string;
}): TranslateWord {
  const cache = new Map<string, Promise<string>>();
  const translateLimit = promiseLimit(
    TRANSLATION_CONCURRENCY,
  ) as PromiseLimitFn;

  return async (word: string) => {
    const normalizedWord = word.trim();
    if (normalizedWord.length === 0) {
      return "";
    }

    const cacheKey = normalizedWord.toLowerCase();
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const requestPromise = translateLimit(() =>
      translateWord(options, normalizedWord),
    ).catch((error: unknown) => {
      console.warn(`Falling back to original word for '${normalizedWord}':`, error);
      return normalizedWord;
    });

    cache.set(cacheKey, requestPromise);
    return requestPromise;
  };
}

async function translateWord(
  options: {
    endpoint: string;
    sourceLanguage: string;
    targetLanguage: string;
  },
  word: string,
): Promise<string> {
  const requestBody: ArgosTranslateRequest = {
    q: word,
    source: options.sourceLanguage,
    target: options.targetLanguage,
  };

  const response = await fetch(options.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Argos request failed (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as ArgosTranslateResponse;
  return data.translatedText ?? word;
}

export async function buildWordByWord(sentence: string, translateWordFn: TranslateWord): Promise<string> {
  const tokens = sentence.trim().length === 0 ? [] : sentence.trim().split(/\s+/);
  const translatedEntries = await Promise.all(
    tokens.map(async (token) => [token, await translateWordFn(token)] as const),
  );

  return JSON.stringify(Object.fromEntries(translatedEntries));
}
