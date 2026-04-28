import type { WordFrequencyInfo } from "../../contracts/cardPayload";

export type WordFrequencyLookup = {
  sourceFile: string | null;
  getWordFrequency: (word: string) => WordFrequencyInfo;
  getMostCommonWords: (limit: number) => string[];
};

export interface WordFrequencyPort {
  getLookup(languageCode: string): Promise<WordFrequencyLookup>;
}
