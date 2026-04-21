import type {
  Paging,
  QueryPrimitive,
  QueryValue,
  SearchSentencesOptions,
  SentenceSearchParams,
  SentenceSearchResponse,
  TatoebaApiErrorPayload,
} from "./tatoebaSentences.types";

export * from "./tatoebaSentences.types";

export const DEFAULT_TATOEBA_API_BASE_URL = "https://api.tatoeba.org";

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
