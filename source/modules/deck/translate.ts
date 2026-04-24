import type {
  PhraseTranslation,
  TranslatePhrase,
  TranslateWord,
  WordTranslation,
} from "./types";
import type { WordFrequencyInfo } from "../shared/cardPayload";
import promiseLimit from "promise-limit";

type PromiseLimitFn = <T>(fn: () => Promise<T>) => Promise<T>;

type ArgosTranslateRequest = {
  q: string;
  source: string;
  target: string;
  alternatives?: number;
};

type ArgosTranslateResponse = {
  translatedText?: string;
  alternatives?: string[];
};

type TranslatorOptions = {
  endpoint: string;
  sourceLanguage: string;
  targetLanguage: string;
  alternatives: number;
  concurrency: number;
};

type BasicTranslation = {
  translatedText: string;
  alternatives: string[];
};

function createBaseTranslator(options: TranslatorOptions): TranslatePhrase {
  const cache = new Map<string, Promise<PhraseTranslation>>();
  const translateLimit = promiseLimit(
    options.concurrency,
  ) as PromiseLimitFn;

  return async (text: string) => {
    const normalizedText = text.trim();
    if (normalizedText.length === 0) {
      return {
        translatedText: "",
        alternatives: [],
      };
    }

    const cacheKey = normalizedText.toLowerCase();
    const cached = cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const requestPromise = translateLimit(() =>
      translateText(options, normalizedText),
    ).catch((error: unknown) => {
      console.warn(`Falling back to original text for '${normalizedText}':`, error);
      return {
        translatedText: normalizedText,
        alternatives: [],
      };
    });

    cache.set(cacheKey, requestPromise);
    return requestPromise;
  };
}

export function createPhraseTranslator(options: TranslatorOptions): TranslatePhrase {
  return createBaseTranslator(options);
}

export function createWordTranslator(options: {
  endpoint: string;
  sourceLanguage: string;
  targetLanguage: string;
  alternatives: number;
  concurrency: number;
  getWordFrequencyInfo: (word: string) => WordFrequencyInfo;
}): TranslateWord {
  const baseTranslator = createBaseTranslator(options);

  return async (word: string): Promise<WordTranslation> => {
    const translation = await baseTranslator(word);
    return {
      translatedText: translation.translatedText,
      alternatives: translation.alternatives,
      frequency: options.getWordFrequencyInfo(word),
    };
  };
}

async function translateText(
  options: TranslatorOptions,
  text: string,
): Promise<BasicTranslation> {
  const requestBody: ArgosTranslateRequest = {
    q: text,
    source: options.sourceLanguage,
    target: options.targetLanguage,
  };

  if (options.alternatives > 0) {
    requestBody.alternatives = options.alternatives;
  }

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
  const translatedText = data.translatedText?.trim() || text;
  const alternatives = Array.from(
    new Set(
      (data.alternatives ?? [])
        .map((value) => value.trim())
        .filter((value) => value.length > 0 && value !== translatedText),
    ),
  );

  return {
    translatedText,
    alternatives,
  };
}

export async function buildWordByWord(sentence: string, translateWordFn: TranslateWord): Promise<string> {
  const tokens = sentence.trim().length === 0 ? [] : sentence.trim().split(/\s+/);
  const translatedEntries = await Promise.all(
    tokens.map(async (token) => [token, await translateWordFn(token)] as const),
  );

  return JSON.stringify(Object.fromEntries(translatedEntries));
}
