import { createArgosTranslationAdapter } from "./argosTranslate/argosTranslationAdapter";
import { createFrequencyWordsAdapter } from "./frequencyWords/frequencyWordsAdapter";
import { createGoogleTtsSpeechAdapter } from "./googleTts/googleTtsSpeechAdapter";
import { createTatoebaSentenceSourceAdapter } from "./tatoeba/tatoebaSentenceSourceAdapter";
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
  wordFrequency?: WordFrequencyPort;
  speech?: SpeechSynthesisPort;
}): IntegrationContext {
  const sentenceSource =
    overrides?.sentenceSource ?? createTatoebaSentenceSourceAdapter();
  const translation = overrides?.translation ?? createArgosTranslationAdapter();
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
