import type { LanguageCode, WordCountFilter } from "../sentenceRetrieval/index";
import type { WordTranslation } from "../shared/cardPayload";

export type { WordTranslation } from "../shared/cardPayload";

export type CardData = {
  sentence: string;
  translation: string;
  keyword: string;
  sentenceId: string;
  wordByWord: string;
  ngramTranslations: string;
};

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
};

export type TranslateWord = (word: string) => Promise<WordTranslation>;
export type TranslatePhrase = (phrase: string) => Promise<PhraseTranslation>;
