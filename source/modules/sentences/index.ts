export const DEFAULT_SENTENCE_SEARCH_SORT = "relevance" as const;

export {
  DEFAULT_TATOEBA_API_BASE_URL,
  TatoebaApiError,
  buildSentenceSearchQuery,
  getAfterCursorFromNextPageUrl,
  getAfterCursorFromPaging,
  searchSentences,
} from "./sentences";
export {
  isSupportedLanguageCode,
  SUPPORTED_LANGUAGE_CODES,
  SUPPORTED_LANGUAGES,
} from "./tatoebaLanguages";
export {
  decodeHtmlEntities,
  extractLanguagesJson,
  renderLanguagesFile,
  updateTatoebaLanguages,
  TATOEBA_LANGUAGE_SOURCE_URL,
  TATOEBA_LANGUAGES_TARGET_FILE,
} from "./updateTatoebaLanguages";

export type {
  Audio,
  FetchLike,
  IncludeAssociation,
  LanguageCode,
  Paging,
  QueryPrimitive,
  QueryValue,
  SearchSentencesOptions,
  Sentence,
  SentenceLicense,
  SentenceOrigin,
  SentenceSearchParams,
  SentenceSearchResponse,
  SentenceSort,
  SentenceSortDirection,
  SentenceSortField,
  SentenceWithExtraInfo,
  SentenceWithTranslations,
  ShowTranslations,
  TatoebaApiErrorPayload,
  TatoebaBoolean,
  Transcription,
  Translation,
  UnsignedIntegerString,
  WordCountFilter,
  WordCountRange,
  WordCountRangeList,
} from "./tatoebaSentences.types";
export type { SupportedLanguageCode, SupportedLanguageName } from "./tatoebaLanguages";
