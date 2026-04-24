import type { LanguageCode, WordCountFilter } from "../sentenceRetrieval/index";
import type { WordTranslation } from "../shared/cardPayload";

export type { WordTranslation } from "../shared/cardPayload";

export const PIPELINE_PASS_NAMES = [
  "retrieve",
  "enrich-translations",
  "enrich-difficulty",
  "enrich-audio",
  "build-apkg",
] as const;

export type PipelinePass = (typeof PIPELINE_PASS_NAMES)[number];

export type PhraseTranslation = {
  translatedText: string;
  alternatives: string[];
};

export type DeckBuildConfig = {
  deckName: string;
  outputPath: string;
  words: string[];
  sentenceLanguage: LanguageCode;
  translationLanguage: LanguageCode;
  sentenceTranslationLimit: number;
  argosSourceLanguage: string;
  argosTargetLanguage: string;
  argosAlternatives: number;
  sentenceWordCount: WordCountFilter;
  sentenceLimit: number;
  argosTranslateUrl: string;
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
