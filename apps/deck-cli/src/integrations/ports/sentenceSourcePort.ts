export type SentenceSearchInput = {
  sourceLanguage: string;
  translationLanguage: string;
  keyword: string;
  wordCount?: string;
  limit: number;
};

export type SentenceSearchResult = {
  id: string;
  text: string;
  translations: string[];
};

export interface SentenceSourcePort {
  searchByKeyword(input: SentenceSearchInput): Promise<SentenceSearchResult[]>;
}
