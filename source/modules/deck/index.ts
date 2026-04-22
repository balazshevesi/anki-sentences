export const DECK_NOTE_FIELDS = [
  "Sentence",
  "SentenceTranslation",
  "Keyword",
  "SentenceId",
  "wordByWord",
  "ngramTranslations",
] as const;

export const DEFAULT_DECK_SORT_FIELD = 0;

export { getCardsForWords } from "./cards";
export { loadDeckBuildConfig } from "./config";
export { loadQuestionFormatHtml } from "./template";
export { buildWordByWord, createPhraseTranslator, createWordTranslator } from "./translate";

export type {
  CardData,
  DeckBuildConfig,
  PhraseTranslation,
  TranslatePhrase,
  TranslateWord,
  WordTranslation,
} from "./types";
