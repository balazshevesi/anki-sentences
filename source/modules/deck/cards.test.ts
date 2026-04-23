import { describe, expect, test } from "bun:test";

import type {
  SentenceSearchResponse,
  SentenceWithTranslations,
} from "../sentenceRetrieval/index";
import type { DeckBuildConfig, PhraseTranslation, WordTranslation } from "./types";
import {
  dedupeSentenceJobs,
  fetchSentenceJobsForWords,
  getCardsForWords,
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

    const jobs = await fetchSentenceJobsForWords(config, { searchSentencesFn });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.word).toBe("hello");
    expect(jobs[0]?.sentence.id).toBe(1);
  });
});

describe("getCardsForWords", () => {
  test("builds cards with injected search and translators", async () => {
    const config = buildConfig(["hello"]);

    const searchSentencesFn = async (): Promise<SentenceSearchResponse> => ({
      data: [buildSentence(7, "Hello world again", ["Szia vilag"]),
      ],
      paging: { has_next: false },
    });

    const translateWord = async (word: string): Promise<WordTranslation> => ({
      translatedText: `${word}-hu`,
      alternatives: [`${word}-alt`],
      frequency: {
        rank: null,
        occurrencePercentage: null,
        rarity: "very_rare",
        hint: "",
      },
    });

    const translatePhrase = async (phrase: string): Promise<PhraseTranslation> => ({
      translatedText: `${phrase}-hu`,
      alternatives: [],
    });

    const cards = await getCardsForWords(
      config,
      translateWord,
      translatePhrase,
      {
        searchSentencesFn,
        ngramThresholds: {
          minCardCount: 1,
          minCardPercentage: 0,
        },
      },
    );

    expect(cards).toHaveLength(1);
    expect(cards[0]?.keyword).toBe("hello");
    expect(cards[0]?.translation).toContain("Szia vilag");

    const wordByWord = JSON.parse(cards[0]?.wordByWord ?? "{}") as Record<string, { translatedText: string }>;
    expect(wordByWord.Hello?.translatedText).toBe("Hello-hu");

    const ngrams = JSON.parse(cards[0]?.ngramTranslations ?? "[]") as Array<{ translatedText: string }>;
    expect(ngrams.length).toBeGreaterThan(0);
    expect(ngrams[0]?.translatedText.endsWith("-hu")).toBe(true);
  });
});
