import { type SupportedLanguageCode } from "./tatoebaLanguages";

export const DEFAULT_TATOEBA_API_BASE_URL = "https://api.tatoeba.org";

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

export class TatoebaApiError extends Error {
  readonly status: number;
  readonly requestUrl: string;
  readonly payload: unknown;

  constructor(
    message: string,
    status: number,
    requestUrl: string,
    payload: unknown,
  ) {
    super(message);
    this.name = "TatoebaApiError";
    this.status = status;
    this.requestUrl = requestUrl;
    this.payload = payload;
  }
}

type QueryPrimitive = string | number | boolean;
type QueryValue = QueryPrimitive | readonly QueryPrimitive[] | null | undefined;

export interface SentenceSearchParams {
  lang: LanguageCode | readonly LanguageCode[];
  sort: SentenceSort;
  q?: string;
  word_count?: string;
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

function toQueryPrimitive(value: QueryPrimitive): string {
  return typeof value === "boolean" ? String(value) : `${value}`;
}

function appendCsvParam(
  searchParams: URLSearchParams,
  key: string,
  value: QueryValue,
): void {
  if (value == null) {
    return;
  }

  if (Array.isArray(value)) {
    const serialized = value.map((item) =>
      toQueryPrimitive(item as QueryPrimitive),
    );
    if (serialized.length > 0) {
      searchParams.append(key, serialized.join(","));
    }
    return;
  }

  searchParams.append(key, toQueryPrimitive(value as QueryPrimitive));
}

function appendMultiParam(
  searchParams: URLSearchParams,
  key: string,
  value: QueryValue,
): void {
  if (value == null) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      searchParams.append(key, toQueryPrimitive(item as QueryPrimitive));
    }
    return;
  }

  searchParams.append(key, toQueryPrimitive(value as QueryPrimitive));
}

export function buildSentenceSearchQuery(
  params: SentenceSearchParams,
): URLSearchParams {
  const query = new URLSearchParams();

  appendCsvParam(query, "lang", params.lang);
  appendCsvParam(query, "sort", params.sort);

  appendCsvParam(query, "q", params.q);
  appendCsvParam(query, "word_count", params.word_count);
  appendCsvParam(query, "owner", params.owner);
  appendCsvParam(query, "is_orphan", params.is_orphan);
  appendCsvParam(query, "is_unapproved", params.is_unapproved);
  appendCsvParam(query, "is_native", params.is_native);
  appendCsvParam(query, "has_audio", params.has_audio);
  appendMultiParam(query, "tag", params.tag);
  appendMultiParam(query, "list", params.list);
  appendCsvParam(query, "origin", params.origin);
  appendCsvParam(query, "license", params.license);

  appendCsvParam(query, "trans:lang", params["trans:lang"]);
  appendCsvParam(query, "trans:is_direct", params["trans:is_direct"]);
  appendCsvParam(query, "trans:owner", params["trans:owner"]);
  appendCsvParam(query, "trans:is_unapproved", params["trans:is_unapproved"]);
  appendCsvParam(query, "trans:is_orphan", params["trans:is_orphan"]);
  appendCsvParam(query, "trans:is_native", params["trans:is_native"]);
  appendCsvParam(query, "trans:has_audio", params["trans:has_audio"]);
  appendCsvParam(query, "trans:count", params["trans:count"]);

  appendCsvParam(query, "after", params.after);
  appendCsvParam(query, "limit", params.limit);
  appendCsvParam(query, "include", params.include);

  appendCsvParam(query, "showtrans", params.showtrans);
  appendCsvParam(query, "showtrans:lang", params["showtrans:lang"]);
  appendCsvParam(query, "showtrans:is_direct", params["showtrans:is_direct"]);
  appendCsvParam(
    query,
    "showtrans:is_unapproved",
    params["showtrans:is_unapproved"],
  );
  appendCsvParam(query, "showtrans:is_orphan", params["showtrans:is_orphan"]);
  appendCsvParam(query, "showtrans:owner", params["showtrans:owner"]);
  appendCsvParam(query, "showtrans:is_native", params["showtrans:is_native"]);
  appendCsvParam(query, "showtrans:has_audio", params["showtrans:has_audio"]);

  if (params.extraParams) {
    for (const [key, value] of Object.entries(params.extraParams)) {
      appendMultiParam(query, key, value);
    }
  }

  return query;
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isApiErrorPayload(value: unknown): value is TatoebaApiErrorPayload {
  if (!isObjectLike(value)) {
    return false;
  }

  const messageOk =
    value.message === undefined || typeof value.message === "string";
  const urlOk = value.url === undefined || typeof value.url === "string";
  const codeOk = value.code === undefined || typeof value.code === "number";
  return messageOk && urlOk && codeOk;
}

function isSentenceSearchResponse(
  value: unknown,
): value is SentenceSearchResponse {
  if (!isObjectLike(value)) {
    return false;
  }

  const data = value.data;
  const paging = value.paging;

  if (!Array.isArray(data) || !isObjectLike(paging)) {
    return false;
  }

  return typeof paging.has_next === "boolean";
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

export async function searchSentences(
  params: SentenceSearchParams,
  options: SearchSentencesOptions = {},
): Promise<SentenceSearchResponse> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const baseUrl = options.baseUrl ?? DEFAULT_TATOEBA_API_BASE_URL;

  if (!fetchImpl) {
    throw new Error("No fetch implementation available.");
  }

  const url = new URL("/v1/sentences", baseUrl);
  url.search = buildSentenceSearchQuery(params).toString();

  const response = await fetchImpl(url, {
    method: "GET",
    signal: options.signal,
    headers: options.headers,
  });

  const payload = await parseResponseBody(response);

  if (!response.ok) {
    const message =
      isApiErrorPayload(payload) && payload.message
        ? payload.message
        : `Tatoeba API request failed with status ${response.status}`;

    throw new TatoebaApiError(
      message,
      response.status,
      url.toString(),
      payload,
    );
  }

  if (!isSentenceSearchResponse(payload)) {
    throw new TatoebaApiError(
      "Unexpected response format from Tatoeba API",
      response.status,
      url.toString(),
      payload,
    );
  }

  return payload;
}

export function getAfterCursorFromNextPageUrl(
  nextPageUrl: string,
): string | null {
  try {
    const url = new URL(nextPageUrl);
    return url.searchParams.get("after");
  } catch {
    return null;
  }
}

export function getAfterCursorFromPaging(paging: Paging): string | null {
  if (!paging.next) {
    return null;
  }

  return getAfterCursorFromNextPageUrl(paging.next);
}
