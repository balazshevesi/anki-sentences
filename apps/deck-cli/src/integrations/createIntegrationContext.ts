import { createArgosTranslationAdapter } from "./argosTranslate/argosTranslationAdapter";
import { createFrequencyWordsAdapter } from "./frequencyWords/frequencyWordsAdapter";
import { createGoogleTranslationAdapter } from "./googleTranslate/googleTranslationAdapter";
import { createGoogleTtsSpeechAdapter } from "./googleTts/googleTtsSpeechAdapter";
import { createTatoebaSentenceSourceAdapter } from "./tatoeba/tatoebaSentenceSourceAdapter";
import type { TranslationProvider } from "../deck/types";
import type {
  SentenceSourcePort,
  SpeechSynthesisPort,
  TranslationPort,
  WordFrequencyLookup,
  WordFrequencyPort,
} from "./ports/index";

export type IntegrationContext = {
  sentenceSource: SentenceSourcePort;
  translation: TranslationPort;
  wordFrequency: WordFrequencyPort;
  speech: SpeechSynthesisPort;
};

function createTranslationAdapter(
  provider: TranslationProvider,
): TranslationPort {
  switch (provider) {
    case "argos":
      return createArgosTranslationAdapter();
    case "google":
      return createGoogleTranslationAdapter();
    default: {
      const exhaustiveProvider: never = provider;
      throw new Error(
        `Unknown translation provider: ${String(exhaustiveProvider)}`,
      );
    }
  }
}

function createCachedWordFrequencyPort(
  basePort: WordFrequencyPort,
): WordFrequencyPort {
  const lookupByLanguage = new Map<string, Promise<WordFrequencyLookup>>();

  return {
    async getLookup(languageCode: string): Promise<WordFrequencyLookup> {
      const normalizedLanguageCode = languageCode.trim().toLowerCase();
      const cacheKey = normalizedLanguageCode || languageCode;
      const cachedLookup = lookupByLanguage.get(cacheKey);
      if (cachedLookup) {
        return cachedLookup;
      }

      const lookupPromise = basePort
        .getLookup(languageCode)
        .catch((error: unknown) => {
          lookupByLanguage.delete(cacheKey);
          throw error;
        });

      lookupByLanguage.set(cacheKey, lookupPromise);
      return lookupPromise;
    },
  };
}

export function createIntegrationContext(overrides?: {
  sentenceSource?: SentenceSourcePort;
  translation?: TranslationPort;
  translationProvider?: TranslationProvider;
  wordFrequency?: WordFrequencyPort;
  speech?: SpeechSynthesisPort;
}): IntegrationContext {
  const sentenceSource =
    overrides?.sentenceSource ?? createTatoebaSentenceSourceAdapter();
  const translation =
    overrides?.translation ??
    createTranslationAdapter(overrides?.translationProvider ?? "argos");
  const wordFrequencyBase =
    overrides?.wordFrequency ?? createFrequencyWordsAdapter();
  const speech = overrides?.speech ?? createGoogleTtsSpeechAdapter();

  return {
    sentenceSource,
    translation,
    wordFrequency: createCachedWordFrequencyPort(wordFrequencyBase),
    speech,
  };
}
