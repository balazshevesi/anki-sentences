import {
  isSupportedLanguageCode,
  type SupportedLanguageCode,
} from "./tatoebaLanguages";
import { searchSentences } from "./sentences";
import type { SentenceSearchResponse, WordCountFilter } from "./tatoebaSentences.types";
import type {
  SentenceSearchInput,
  SentenceSearchResult,
  SentenceSourcePort,
} from "../ports/index";

const DEFAULT_TATOEBA_SORT = "relevance" as const;

type SearchSentencesFn = typeof searchSentences;

function assertSupportedLanguageCode(
  label: string,
  languageCode: string,
): asserts languageCode is SupportedLanguageCode {
  if (!isSupportedLanguageCode(languageCode)) {
    throw new Error(
      `Unsupported ${label} language code for Tatoeba sentence search: ${languageCode}`,
    );
  }
}

function mapSentenceResponse(
  response: SentenceSearchResponse,
): SentenceSearchResult[] {
  return response.data.map((sentence) => ({
    id: String(sentence.id),
    text: sentence.text,
    translations: (sentence.translations ?? [])
      .map((translation) => translation.text)
      .filter((translation) => translation.trim().length > 0),
  }));
}

export function createTatoebaSentenceSourceAdapter(options?: {
  searchSentencesFn?: SearchSentencesFn;
}): SentenceSourcePort {
  const searchSentencesFn = options?.searchSentencesFn ?? searchSentences;

  return {
    async searchByKeyword(
      input: SentenceSearchInput,
    ): Promise<SentenceSearchResult[]> {
      const sourceLanguage = input.sourceLanguage.trim();
      const translationLanguage = input.translationLanguage.trim();

      assertSupportedLanguageCode("source", sourceLanguage);
      assertSupportedLanguageCode("translation", translationLanguage);

      const response = await searchSentencesFn({
        lang: sourceLanguage,
        "trans:lang": translationLanguage,
        sort: DEFAULT_TATOEBA_SORT,
        q: input.keyword,
        word_count: input.wordCount as WordCountFilter | undefined,
        limit: input.limit,
      });

      return mapSentenceResponse(response);
    },
  };
}
