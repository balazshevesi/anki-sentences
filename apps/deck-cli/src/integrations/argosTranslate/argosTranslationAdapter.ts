import promiseLimit from "promise-limit";
import type { WordFrequencyInfo } from "../../contracts/cardPayload";
import {
  createTranslationCacheKey,
  getPersistentTranslationCache,
  type CachedTranslation,
} from "../translationCache";
import type {
  PhraseTranslation,
  TranslatePhrase,
  TranslateWord,
  TranslationPort,
  TranslatorOptions,
} from "../ports/index";

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

type WordTranslatorOptions = TranslatorOptions & {
  getWordFrequencyInfo: (word: string) => WordFrequencyInfo;
};

function createCacheKey(options: TranslatorOptions, text: string): string {
  return createTranslationCacheKey({
    provider: "argos_translate",
    sourceLanguage: options.sourceLanguage,
    targetLanguage: options.targetLanguage,
    alternatives: options.alternatives,
    text,
  });
}

function createBaseTranslator(options: TranslatorOptions): TranslatePhrase {
  const inFlightCache = new Map<string, Promise<PhraseTranslation>>();
  const translateLimit = promiseLimit(options.concurrency) as PromiseLimitFn;
  const persistentCache = options.cachePath
    ? getPersistentTranslationCache(options.cachePath)
    : null;

  return async (text: string) => {
    const normalizedText = text.trim();
    if (normalizedText.length === 0) {
      return {
        translatedText: "",
        alternatives: [],
      };
    }

    const cacheKey = createCacheKey(options, normalizedText);
    const inFlight = inFlightCache.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const cachedTranslation = await persistentCache?.get(cacheKey);
    if (cachedTranslation) {
      return cachedTranslation;
    }

    const inFlightAfterCacheRead = inFlightCache.get(cacheKey);
    if (inFlightAfterCacheRead) {
      return inFlightAfterCacheRead;
    }

    const requestPromise = translateLimit(() =>
      translateText(options, normalizedText),
    )
      .then(async (translation) => {
        await persistentCache?.set(cacheKey, translation);
        return translation;
      })
      .catch((error: unknown) => {
        console.warn(
          `Translation unavailable for '${normalizedText}', leaving empty translation:`,
          error,
        );
        return {
          translatedText: "",
          alternatives: [],
        };
      });

    inFlightCache.set(cacheKey, requestPromise);
    return requestPromise;
  };
}

export function createPhraseTranslator(
  options: TranslatorOptions,
): TranslatePhrase {
  return createBaseTranslator(options);
}

export function createWordTranslator(
  options: WordTranslatorOptions,
): TranslateWord {
  const baseTranslator = createBaseTranslator(options);

  return async (word: string) => {
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
): Promise<CachedTranslation> {
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

export function createArgosTranslationAdapter(): TranslationPort {
  return {
    createPhraseTranslator,
    createWordTranslator,
  };
}
