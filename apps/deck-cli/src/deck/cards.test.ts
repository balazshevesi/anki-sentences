import { describe, expect, test } from "bun:test";

import type {
  SentenceSearchInput,
  SentenceSearchResult,
} from "../integrations/ports/index";
import type { DeckBuildConfig } from "./types";
import {
  dedupeSentenceJobs,
  fetchSentenceJobsForWords,
  type SentenceJob,
} from "./cards";

function buildConfig(words: string[]): DeckBuildConfig {
  return {
    words,
    commonWordLimit: 0,
    deckName: "test",
    outputPath: "../output/test.apkg",
    sentenceLanguage: "eng",
    translationLanguage: "hun",
    sentenceTranslationLimit: 3,
    translationProvider: "argos",
    translationSourceLanguage: "en",
    translationTargetLanguage: "hu",
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

function buildSentence(
  id: number,
  text: string,
  translations: string[] = [],
): SentenceSearchResult {
  return {
    id: String(id),
    text,
    translations,
  };
}

describe("dedupeSentenceJobs", () => {
  test("removes duplicate ids and normalized texts", () => {
    const jobs: SentenceJob[] = [
      {
        word: "hello",
        sentence: buildSentence(10, "Hello   world"),
      },
      {
        word: "greeting",
        sentence: buildSentence(10, "Completely different text"),
      },
      {
        word: "salute",
        sentence: buildSentence(12, " hello world "),
      },
      {
        word: "planet",
        sentence: buildSentence(13, "Hello from Earth"),
      },
    ];

    const deduped = dedupeSentenceJobs(jobs);
    expect(deduped).toHaveLength(2);
    expect(deduped[0]?.word).toBe("hello");
    expect(deduped[1]?.word).toBe("planet");
  });
});

describe("fetchSentenceJobsForWords", () => {
  test("uses injected search function and dedupes overlapping results", async () => {
    const config = buildConfig(["hello", "greeting"]);

    const sentenceSource = {
      async searchByKeyword({ keyword }: SentenceSearchInput) {
        if (keyword === "hello") {
          return [buildSentence(1, "Hello there")];
        }

        return [buildSentence(2, " hello   there ")];
      },
    };

    const jobs = await fetchSentenceJobsForWords(config, {
      sentenceSource,
      wordRetrievalConcurrency: 1,
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.word).toBe("hello");
    expect(jobs[0]?.sentence.id).toBe("1");
  });

  test("excludes sentences matching configured terms", async () => {
    const config = {
      ...buildConfig(["president"]),
      sentenceExclusions: ["president", "chancellor"],
    };

    const sentenceSource = {
      async searchByKeyword(_input: SentenceSearchInput) {
        return [
          buildSentence(1, "The President will address parliament today."),
          buildSentence(2, "I walked to the station this morning."),
        ];
      },
    };

    const jobs = await fetchSentenceJobsForWords(config, {
      sentenceSource,
      wordRetrievalConcurrency: 1,
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.sentence.id).toBe("2");
  });
});
