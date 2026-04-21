import { describe, expect, test } from "bun:test";

import {
  buildSentenceSearchQuery,
  getAfterCursorFromNextPageUrl,
  searchSentences,
  TatoebaApiError,
} from "./tatoebaSentences";
import {
  isSupportedLanguageCode,
  SUPPORTED_LANGUAGE_CODES,
  SUPPORTED_LANGUAGES,
} from "./tatoebaLanguages";

describe("buildSentenceSearchQuery", () => {
  test("serializes comma-separated and repeatable filters", () => {
    const query = buildSentenceSearchQuery({
      lang: ["eng", "deu"],
      sort: "relevance",
      q: "hello",
      tag: ["OK", "colloquial"],
      list: [123, 456],
      include: ["audios", "transcriptions"],
      "trans:lang": ["epo", "sun"],
      extraParams: {
        "trans:1:lang": "jpn",
        "trans:1:is_direct": "yes",
      },
    });

    expect(query.get("lang")).toBe("eng,deu");
    expect(query.get("sort")).toBe("relevance");
    expect(query.get("q")).toBe("hello");
    expect(query.getAll("tag")).toEqual(["OK", "colloquial"]);
    expect(query.getAll("list")).toEqual(["123", "456"]);
    expect(query.get("include")).toBe("audios,transcriptions");
    expect(query.get("trans:lang")).toBe("epo,sun");
    expect(query.get("trans:1:lang")).toBe("jpn");
    expect(query.get("trans:1:is_direct")).toBe("yes");
  });
});

describe("searchSentences", () => {
  test("returns parsed sentence search payload", async () => {
    const fetchCalls: string[] = [];
    const fetchImpl = async (input: string | URL) => {
      fetchCalls.push(typeof input === "string" ? input : input.toString());
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 3613319,
              text: "Hello?",
              lang: "eng",
              script: null,
              license: "CC BY 2.0 FR",
              owner: "Thanuir",
              is_unapproved: false,
            },
          ],
          paging: {
            total: 1,
            has_next: false,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    };

    const result = await searchSentences(
      {
        lang: "eng",
        sort: "relevance",
        q: "hello",
      },
      {
        fetchImpl,
      }
    );

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]).toContain("/v1/sentences");
    expect(fetchCalls[0]).toContain("lang=eng");
    expect(fetchCalls[0]).toContain("sort=relevance");
    expect(fetchCalls[0]).toContain("q=hello");
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.text).toBe("Hello?");
  });

  test("throws TatoebaApiError on non-2xx responses", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          message: "Invalid value for parameter 'sort'",
          code: 400,
          url: "/v1/sentences?lang=eng&sort=bogus",
        }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        }
      );

    await expect(
      searchSentences(
        {
          lang: "eng",
          sort: "relevance",
        },
        { fetchImpl }
      )
    ).rejects.toBeInstanceOf(TatoebaApiError);

    try {
      await searchSentences(
        {
          lang: "eng",
          sort: "relevance",
        },
        { fetchImpl }
      );
      throw new Error("Expected searchSentences to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(TatoebaApiError);
      const apiError = error as TatoebaApiError;
      expect(apiError.status).toBe(400);
      expect(apiError.message).toContain("Invalid value for parameter");
    }
  });
});

describe("getAfterCursorFromNextPageUrl", () => {
  test("extracts after cursor from next page url", () => {
    const cursor = getAfterCursorFromNextPageUrl(
      "https://api.tatoeba.org/v1/sentences?lang=eng&sort=relevance&limit=1&q=hello&after=10099%2C3613319"
    );
    expect(cursor).toBe("10099,3613319");
  });
});

describe("supported languages", () => {
  test("contains known language codes", () => {
    expect(SUPPORTED_LANGUAGE_CODES).toContain("eng");
    expect(SUPPORTED_LANGUAGE_CODES).toContain("deu");
    expect(SUPPORTED_LANGUAGES.eng).toBe("English");
  });

  test("validates codes with type guard", () => {
    expect(isSupportedLanguageCode("eng")).toBe(true);
    expect(isSupportedLanguageCode("zzz")).toBe(false);
  });
});
