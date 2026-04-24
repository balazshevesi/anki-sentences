import { type SupportedLanguageCode } from "./tatoebaLanguages";

export type TatoebaBoolean = "yes" | "no";
export type SentenceSortDirection = "" | "-";
export type SentenceSortField =
  | "relevance"
  | "words"
  | "created"
  | "modified"
  | "random";
export type SentenceSort = `${SentenceSortDirection}${SentenceSortField}`;

export type SentenceOrigin = "original" | "translation" | "known" | "unknown";
export type SentenceLicense = "CC BY 2.0 FR" | "CC0 1.0" | "PROBLEM";
export type ShowTranslations = "matching" | "all" | "none";
export type IncludeAssociation = "audios" | "transcriptions";
export type LanguageCode = SupportedLanguageCode;
export type UnsignedIntegerString = Exclude<`${bigint}`, `-${string}`>;
export type WordCountRange =
  | UnsignedIntegerString
  | `${UnsignedIntegerString}-${UnsignedIntegerString}`
  | `${UnsignedIntegerString}-`
  | `-${UnsignedIntegerString}`;
export type WordCountRangeList =
  | WordCountRange
  | `${WordCountRange},${WordCountRange}`
  | `${WordCountRange},${WordCountRange},${WordCountRange}`
  | `${WordCountRange},${WordCountRange},${WordCountRange},${WordCountRange}`;
export type WordCountFilter = WordCountRangeList | `!${WordCountRangeList}`;

export interface Paging {
  first?: string;
  total?: number;
  has_next: boolean;
  next?: string;
}

export interface Sentence {
  id: number;
  text: string;
  lang: LanguageCode | null;
  script: string | null;
  license: SentenceLicense;
  owner: string | null;
  is_unapproved: boolean;
}

export interface Transcription {
  text: string;
  script: string;
  needsReview: boolean;
  type: "transcription" | "altscript";
  html: string;
  editor: string | null;
  modified: string;
}

export interface Audio {
  id: number;
  author: string;
  licence: string;
  attribution_url: string;
  download_url: string;
  created: string;
  modified: string;
}

export interface SentenceWithExtraInfo extends Sentence {
  transcriptions?: Transcription[];
  audios?: Audio[];
}

export interface Translation extends SentenceWithExtraInfo {
  is_direct: boolean;
}

export interface SentenceWithTranslations extends SentenceWithExtraInfo {
  translations?: Translation[];
}

export interface SentenceSearchResponse {
  data: SentenceWithTranslations[];
  paging: Paging;
}

export interface TatoebaApiErrorPayload {
  message?: string;
  url?: string;
  code?: number;
}

export type QueryPrimitive = string | number | boolean;
export type QueryValue =
  | QueryPrimitive
  | readonly QueryPrimitive[]
  | null
  | undefined;

export interface SentenceSearchParams {
  lang: LanguageCode | readonly LanguageCode[];
  sort: SentenceSort;
  q?: string;
  word_count?: WordCountFilter;
  owner?: string | readonly string[];
  is_orphan?: TatoebaBoolean;
  is_unapproved?: TatoebaBoolean;
  is_native?: TatoebaBoolean;
  has_audio?: TatoebaBoolean;
  tag?: string | readonly string[];
  list?: number | string | readonly (number | string)[];
  origin?: SentenceOrigin;
  license?: SentenceLicense | readonly SentenceLicense[];
  "trans:lang"?: LanguageCode | readonly LanguageCode[];
  "trans:is_direct"?: TatoebaBoolean;
  "trans:owner"?: string | readonly string[];
  "trans:is_unapproved"?: TatoebaBoolean;
  "trans:is_orphan"?: TatoebaBoolean;
  "trans:is_native"?: TatoebaBoolean;
  "trans:has_audio"?: TatoebaBoolean;
  "trans:count"?: "0" | "!0";
  after?: string | number;
  limit?: number;
  include?: IncludeAssociation | readonly IncludeAssociation[];
  showtrans?: ShowTranslations;
  "showtrans:lang"?: LanguageCode | readonly LanguageCode[];
  "showtrans:is_direct"?: TatoebaBoolean;
  "showtrans:is_unapproved"?: TatoebaBoolean;
  "showtrans:is_orphan"?: TatoebaBoolean;
  "showtrans:owner"?: string | readonly string[];
  "showtrans:is_native"?: TatoebaBoolean;
  "showtrans:has_audio"?: TatoebaBoolean;
  extraParams?: Record<string, QueryValue>;
}

export interface SearchSentencesOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
  signal?: AbortSignal;
  headers?: Record<string, string> | [string, string][];
}

export type FetchLike = (
  input: string | URL,
  init?: {
    method?: string;
    signal?: AbortSignal;
    headers?: Record<string, string> | [string, string][];
  },
) => Promise<Response>;
