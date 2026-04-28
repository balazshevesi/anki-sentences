import promiseLimit from "promise-limit";
import type { WordFrequencyInfo } from "../../contracts/cardPayload";
import {
  createTranslationCacheKey,
  getPersistentTranslationCache,
  type CachedTranslation,
} from "../translationCache";
import { resolveGoogleAuthHeaders } from "../googleTts/googleTtsAuth";
import type {
  PhraseTranslation,
  TranslatePhrase,
  TranslateWord,
  TranslationPort,
  TranslatorOptions,
} from "../ports/index";

type PromiseLimitFn = <T>(fn: () => Promise<T>) => Promise<T>;

type GoogleTranslateResponse = {
  data?: {
    translations?: Array<{
      translatedText?: unknown;
    }>;
  };
  error?: {
    message?: unknown;
  };
};

type WordTranslatorOptions = TranslatorOptions & {
  getWordFrequencyInfo: (word: string) => WordFrequencyInfo;
};

const GOOGLE_TRANSLATE_TIMEOUT_MS = 30_000;

function createCacheKey(options: TranslatorOptions, text: string): string {
  return createTranslationCacheKey({
    provider: "google_translate",
    sourceLanguage: options.sourceLanguage,
    targetLanguage: options.targetLanguage,
    text: text.toLocaleLowerCase(),
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

    const requestPromise = translateLimit(() =>
      translateText(options, normalizedText),
    )
      .then(async (translation) => {
        await persistentCache?.set(cacheKey, translation);
        return translation;
      })
      .catch((error: unknown) => {
        console.warn(
          `Google Translate unavailable for '${normalizedText}', leaving empty translation:`,
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

export function createGooglePhraseTranslator(
  options: TranslatorOptions,
): TranslatePhrase {
  return createBaseTranslator(options);
}

export function createGoogleWordTranslator(
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

async function buildGoogleTranslateHeaders(
  options: TranslatorOptions,
): Promise<Headers> {
  if (options.apiKey?.trim()) {
    const headers = new Headers();
    headers.set("content-type", "application/json");
    return headers;
  }

  const headers = await resolveGoogleAuthHeaders({
    accessToken: options.accessToken,
    quotaProject: options.quotaProject,
  });
  headers.set("content-type", "application/json");
  return headers;
}

function buildGoogleTranslateUrl(options: TranslatorOptions): string {
  const url = new URL(options.endpoint);
  const apiKey = options.apiKey?.trim();
  if (apiKey && !url.searchParams.has("key")) {
    url.searchParams.set("key", apiKey);
  }

  return url.toString();
}

function toGoogleTranslateErrorMessage(
  statusCode: number,
  payload: GoogleTranslateResponse | null,
  responseBody: string,
): string {
  const apiErrorMessage = payload?.error?.message;
  if (
    typeof apiErrorMessage === "string" &&
    apiErrorMessage.trim().length > 0
  ) {
    return `Google Translate API request failed (${statusCode}): ${apiErrorMessage}`;
  }

  const body = responseBody.trim();
  if (body.length > 0) {
    return `Google Translate API request failed (${statusCode}): ${body}`;
  }

  return `Google Translate API request failed with status ${statusCode}.`;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replace(/&#(\d+);/g, (match, codePoint: string) => {
      const parsedCodePoint = Number.parseInt(codePoint, 10);
      return Number.isFinite(parsedCodePoint)
        ? String.fromCodePoint(parsedCodePoint)
        : match;
    });
}

async function translateText(
  options: TranslatorOptions,
  text: string,
): Promise<CachedTranslation> {
  const response = await fetch(buildGoogleTranslateUrl(options), {
    method: "POST",
    headers: await buildGoogleTranslateHeaders(options),
    body: JSON.stringify({
      q: text,
      source: options.sourceLanguage,
      target: options.targetLanguage,
      format: "text",
    }),
    signal: AbortSignal.timeout(GOOGLE_TRANSLATE_TIMEOUT_MS),
  });

  const responseBody = await response.text();
  let payload: GoogleTranslateResponse | null = null;
  if (responseBody.trim().length > 0) {
    try {
      payload = JSON.parse(responseBody) as GoogleTranslateResponse;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw new Error(
      toGoogleTranslateErrorMessage(response.status, payload, responseBody),
    );
  }

  const translatedText = payload?.data?.translations?.[0]?.translatedText;
  return {
    translatedText:
      typeof translatedText === "string" && translatedText.trim().length > 0
        ? decodeHtmlEntities(translatedText.trim())
        : text,
    alternatives: [],
  };
}

export function createGoogleTranslationAdapter(): TranslationPort {
  return {
    createPhraseTranslator: createGooglePhraseTranslator,
    createWordTranslator: createGoogleWordTranslator,
  };
}
