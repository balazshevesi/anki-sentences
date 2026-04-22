import type { LanguageCode, WordCountFilter } from "../sentenceRetrieval/index";
import type { WordFrequencyInfo } from "../wordFrequencies/index";

export type CardData = {
  sentence: string;
  translation: string;
  keyword: string;
  sentenceId: string;
  wordByWord: string;
};

export type WordTranslation = {
  translatedText: string;
  alternatives: string[];
  frequency: WordFrequencyInfo;
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
};

export type TranslateWord = (word: string) => Promise<WordTranslation>;
