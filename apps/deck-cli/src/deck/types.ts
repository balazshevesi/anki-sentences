import type {
  LanguageCode,
  WordCountFilter,
} from "../integrations/tatoeba/index";
import type { WordTranslation } from "../contracts/cardPayload";

export type { WordTranslation } from "../contracts/cardPayload";

export const PIPELINE_PASS_NAMES = [
  "retrieve",
  "enrich-translations",
  "enrich-translation-alternatives",
  "enrich-difficulty",
  "enrich-audio",
  "build-apkg",
] as const;

export type PipelinePass = (typeof PIPELINE_PASS_NAMES)[number];

export type PhraseTranslation = {
  translatedText: string;
  alternatives: string[];
};

export type TranslationProvider = "argos" | "google";

export type DeckBuildConfig = {
  deckName: string;
  outputPath: string;
  words: string[];
  commonWordLimit: number;
  sentenceLanguage: LanguageCode;
  translationLanguage: LanguageCode;
  sentenceTranslationLimit: number;
  translationProvider: TranslationProvider;
  translationSourceLanguage: string;
  translationTargetLanguage: string;
  argosAlternatives: number;
  sentenceWordCount: WordCountFilter;
  sentenceLimit: number;
  argosTranslateUrl: string;
  argosTranslationCachePath?: string;
  googleTranslateUrl: string;
  googleTranslationCachePath?: string;
  googleTranslateAccessToken?: string;
  googleTranslateApiKey?: string;
  googleTranslateQuotaProject?: string;
  sentenceExclusions: string[];
  googleTtsAccessToken?: string;
  googleTtsLanguageCode?: string;
  googleTtsVoiceName?: string;
  googleTtsSpeakingRate: number;
  googleTtsPitch: number;
  audioOutputDir: string;
  audioForceRegenerate: boolean;
  googleCloudQuotaProject?: string;
};

export type DeckRuntimeConfig = {
  wordRetrievalConcurrency: number;
  sentenceMetadataConcurrency: number;
  audioMetadataConcurrency: number;
  translationConcurrency: number;
  ngramTranslationLimitPerCard: number;
  ngramMinCardCount: number;
  ngramMinCardPercentage: number;
  ankiSortField: number;
};

export type TranslateWord = (word: string) => Promise<WordTranslation>;
export type TranslatePhrase = (phrase: string) => Promise<PhraseTranslation>;
