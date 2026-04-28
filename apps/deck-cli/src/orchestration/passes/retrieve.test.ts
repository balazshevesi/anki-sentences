import { describe, expect, test } from "bun:test";
import type { DeckBuildConfig } from "../../deck/types";
import type { WordFrequencyPort } from "../../integrations/ports/index";
import { getSentenceRetrievalWords } from "./retrieve";

function buildConfig(options?: {
  words?: string[];
  commonWordLimit?: number;
}): DeckBuildConfig {
  return {
    deckName: "test",
    outputPath: "../output/test.apkg",
    words: options?.words ?? [],
    commonWordLimit: options?.commonWordLimit ?? 0,
    sentenceLanguage: "deu",
    translationLanguage: "eng",
    sentenceTranslationLimit: 3,
    translationProvider: "argos",
    translationSourceLanguage: "de",
    translationTargetLanguage: "en",
    argosAlternatives: 2,
    sentenceWordCount: "1-10",
    sentenceLimit: 20,
    argosTranslateUrl: "http://127.0.0.1:8000/translate",
    argosTranslationCachePath: "../output/argos-translate-cache.json",
    googleTranslateUrl:
      "https://translation.googleapis.com/language/translate/v2",
    googleTranslationCachePath: "../output/google-translate-cache.json",
    sentenceExclusions: [],
    googleTtsSpeakingRate: 1,
    googleTtsPitch: 0,
    audioOutputDir: "../output/test-audio",
    audioForceRegenerate: false,
  };
}

function buildWordFrequencyPort(commonWords: string[]): WordFrequencyPort {
  return {
    async getLookup(languageCode: string) {
      return {
        sourceFile: `${languageCode}.csv`,
        getMostCommonWords: (limit: number) => commonWords.slice(0, limit),
        getWordFrequency: () => ({
          rank: 1,
          occurrencePercentage: 42,
          rarity: "very_common",
          hint: "Very common",
        }),
      };
    },
  };
}

describe("getSentenceRetrievalWords", () => {
  test("adds top frequency words and dedupes them with explicit words", async () => {
    const words = await getSentenceRetrievalWords(
      buildConfig({ words: ["doch", "ich"], commonWordLimit: 3 }),
      buildWordFrequencyPort(["ich", "du", "das"]),
    );

    expect(words).toEqual(["doch", "ich", "du", "das"]);
  });

  test("can use only common words", async () => {
    const words = await getSentenceRetrievalWords(
      buildConfig({ commonWordLimit: 2 }),
      buildWordFrequencyPort(["ich", "du", "das"]),
    );

    expect(words).toEqual(["ich", "du"]);
  });
});
