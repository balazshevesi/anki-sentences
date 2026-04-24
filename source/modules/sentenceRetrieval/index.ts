export const DEFAULT_SENTENCE_SEARCH_SORT = "relevance" as const;

export {
  TatoebaApiError,
  buildSentenceSearchQuery,
  getAfterCursorFromNextPageUrl,
  searchSentences,
} from "./sentences";
export {
  isSupportedLanguageCode,
  SUPPORTED_LANGUAGE_CODES,
  SUPPORTED_LANGUAGES,
} from "./tatoebaLanguages";

export type {
  LanguageCode,
  SentenceSearchResponse,
  SentenceWithTranslations,
  WordCountFilter,
} from "./tatoebaSentences.types";
