import { describe, expect, test } from "bun:test";

import type {
  SentenceSearchResponse,
  SentenceWithTranslations,
} from "../sentenceRetrieval/index";
import type { DeckBuildConfig } from "./types";
import {
  dedupeSentenceJobs,
  fetchSentenceJobsForWords,
  type SentenceJob,
} from "./cards";

function buildConfig(words: string[]): DeckBuildConfig {
  return {
    words,
    deckName: "test",
    outputPath: "../output/test.apkg",
    sentenceLanguage: "eng",
    translationLanguage: "hun",
    sentenceTranslationLimit: 3,
    argosSourceLanguage: "en",
    argosTargetLanguage: "hu",
    argosAlternatives: 2,
    sentenceWordCount: "1-10",
    sentenceLimit: 20,
    argosTranslateUrl: "http://127.0.0.1:8000/translate",
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
): SentenceWithTranslations {
  return {
    id,
    text,
    lang: "eng",
    script: null,
    license: "CC BY 2.0 FR",
    owner: null,
    is_unapproved: false,
    translations: translations.map((translationText, index) => ({
      id: id * 100 + index + 1,
      text: translationText,
      lang: "hun",
      script: null,
      license: "CC BY 2.0 FR",
      owner: null,
      is_unapproved: false,
      is_direct: true,
    })),
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

    const searchSentencesFn = async ({ q }: { q?: string }): Promise<SentenceSearchResponse> => {
      if (q === "hello") {
        return {
          data: [buildSentence(1, "Hello there")],
          paging: { has_next: false },
        };
      }

      return {
        data: [buildSentence(2, " hello   there ")],
        paging: { has_next: false },
      };
    };

    const jobs = await fetchSentenceJobsForWords(config, {
      searchSentencesFn,
      wordRetrievalConcurrency: 1,
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.word).toBe("hello");
    expect(jobs[0]?.sentence.id).toBe(1);
  });

  test("excludes sentences matching configured terms", async () => {
    const config = {
      ...buildConfig(["president"]),
      sentenceExclusions: ["president", "chancellor"],
    };

    const searchSentencesFn = async (): Promise<SentenceSearchResponse> => ({
      data: [
        buildSentence(1, "The President will address parliament today."),
        buildSentence(2, "I walked to the station this morning."),
      ],
      paging: { has_next: false },
    });

    const jobs = await fetchSentenceJobsForWords(config, {
      searchSentencesFn,
      wordRetrievalConcurrency: 1,
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.sentence.id).toBe(2);
  });
});
