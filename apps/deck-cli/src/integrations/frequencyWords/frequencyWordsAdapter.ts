import { loadWordFrequencyLookup } from "./lookup";
import type {
  WordFrequencyLookup,
  WordFrequencyPort,
} from "../ports/index";

type LoadWordFrequencyLookupFn = (
  languageCode: string,
) => Promise<WordFrequencyLookup>;

export function createFrequencyWordsAdapter(options?: {
  loadWordFrequencyLookupFn?: LoadWordFrequencyLookupFn;
}): WordFrequencyPort {
  const loadLookup = options?.loadWordFrequencyLookupFn ?? loadWordFrequencyLookup;

  return {
    async getLookup(languageCode: string): Promise<WordFrequencyLookup> {
      return loadLookup(languageCode);
    },
  };
}
