import type {
  WordFrequencyInfo,
  WordTranslation,
} from "../../contracts/cardPayload";

export type PhraseTranslation = {
  translatedText: string;
  alternatives: string[];
};

export type TranslateWord = (word: string) => Promise<WordTranslation>;
export type TranslatePhrase = (phrase: string) => Promise<PhraseTranslation>;

export type TranslatorOptions = {
  endpoint: string;
  sourceLanguage: string;
  targetLanguage: string;
  alternatives: number;
  concurrency: number;
};

export interface TranslationPort {
  createPhraseTranslator(options: TranslatorOptions): TranslatePhrase;
  createWordTranslator(
    options: TranslatorOptions & {
      getWordFrequencyInfo: (word: string) => WordFrequencyInfo;
    },
  ): TranslateWord;
}

export async function buildWordByWord(
  sentence: string,
  translateWordFn: TranslateWord,
): Promise<string> {
  const tokens =
    sentence.trim().length === 0 ? [] : sentence.trim().split(/\s+/);
  const translatedEntries = await Promise.all(
    tokens.map(async (token) => [token, await translateWordFn(token)] as const),
  );

  return JSON.stringify(Object.fromEntries(translatedEntries));
}
