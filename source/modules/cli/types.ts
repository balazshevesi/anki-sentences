import type { WordCountFilter } from "../sentenceRetrieval/index";
import type { DeckBuildConfig } from "../deck/types";

export type PipelineCommand =
  | "retrieve"
  | "enrich-translations"
  | "enrich-difficulty"
  | "enrich-audio"
  | "build-apkg"
  | "pipeline";

export type CliOptions = {
  words: string[];
  deckName: string;
  csvPath: string;
  outputPath: string;
  sentenceLanguage: DeckBuildConfig["sentenceLanguage"];
  translationLanguage: DeckBuildConfig["translationLanguage"];
  sentenceTranslationLimit: number;
  argosSourceLanguage: string;
  argosTargetLanguage: string;
  argosAlternatives: number;
  sentenceWordCount: WordCountFilter;
  sentenceLimit: number;
  argosTranslateUrl: string;
  sentenceExclusions: string[];
  googleTtsApiKey?: string;
  googleTtsAccessToken?: string;
  googleTtsLanguageCode?: string;
  googleTtsVoiceName?: string;
  googleTtsSpeakingRate: number;
  googleTtsPitch: number;
  audioOutputDir: string;
  audioForceRegenerate: boolean;
  skipAudio: boolean;
};

export type RawCliOptions = {
  csv?: unknown;
  apkg?: unknown;
  output?: unknown;
  word?: unknown;
  deckName?: unknown;
  sentenceLang?: unknown;
  translationLang?: unknown;
  sentenceTranslations?: unknown;
  wordCount?: unknown;
  limit?: unknown;
  argosSource?: unknown;
  argosTarget?: unknown;
  argosAlternatives?: unknown;
  argosUrl?: unknown;
  googleTtsApiKey?: unknown;
  googleTtsAccessToken?: unknown;
  googleTtsLanguageCode?: unknown;
  googleTtsVoice?: unknown;
  googleTtsSpeakingRate?: unknown;
  googleTtsPitch?: unknown;
  audioDir?: unknown;
  audioForce?: unknown;
  sentenceExclusions?: unknown;
  excludePolitics?: unknown;
  skipAudio?: unknown;
};

export type CommandDefinition = {
  name: PipelineCommand;
  description: string;
};
