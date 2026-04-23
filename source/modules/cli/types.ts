import type { WordCountFilter } from "../sentenceRetrieval/index";
import type { DeckBuildConfig } from "../deck/types";

export type PipelineCommand =
  | "retrieve"
  | "enrich-translations"
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
  skipAudio?: unknown;
};

export type CommandDefinition = {
  name: PipelineCommand;
  description: string;
};
