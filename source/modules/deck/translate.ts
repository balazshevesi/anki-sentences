import type { TranslateWord } from "./types";

type ArgosTranslateRequest = {
  q: string;
  source: string;
  target: string;
};

type ArgosTranslateResponse = {
  translatedText?: string;
};

export function createWordTranslator(options: {
  endpoint: string;
  sourceLanguage: string;
  targetLanguage: string;
}): TranslateWord {
  const cache = new Map<string, Promise<string>>();

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

    const requestPromise = translateWord(options, normalizedWord).catch((error: unknown) => {
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
