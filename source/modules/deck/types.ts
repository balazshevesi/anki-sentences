import type { LanguageCode, WordCountFilter } from "../sentenceRetrieval/index";

export type CardData = {
  sentence: string;
  translation: string;
  keyword: string;
  sentenceId: string;
  wordByWord: string;
};

export type DeckBuildConfig = {
  deckName: string;
  outputPath: string;
  words: string[];
  sentenceLanguage: LanguageCode;
  translationLanguage: LanguageCode;
  argosSourceLanguage: string;
  argosTargetLanguage: string;
  sentenceWordCount: WordCountFilter;
  sentenceLimit: number;
  argosTranslateUrl: string;
};

export type TranslateWord = (word: string) => Promise<string>;
