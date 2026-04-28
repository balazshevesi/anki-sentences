import { describe, expect, test } from "bun:test";
import { createIntegrationContext } from "./createIntegrationContext";
import type {
  SentenceSourcePort,
  SpeechSynthesisPort,
  TranslationPort,
  WordFrequencyPort,
} from "./ports/index";

const NOOP_SENTENCE_SOURCE: SentenceSourcePort = {
  async searchByKeyword() {
    return [];
  },
};

const NOOP_TRANSLATION_PORT: TranslationPort = {
  createPhraseTranslator() {
    return async () => ({ translatedText: "", alternatives: [] });
  },
  createWordTranslator() {
    return async () => ({
      translatedText: "",
      alternatives: [],
      frequency: {
        rank: null,
        occurrencePercentage: null,
        rarity: "very_rare",
        hint: "",
      },
    });
  },
};

const NOOP_SPEECH_PORT: SpeechSynthesisPort = {
  resolveLanguageCode() {
    return undefined;
  },
  async synthesize() {
    throw new Error("Not implemented");
  },
  createErrorMetadata(sentenceId: string, message: string) {
    return {
      status: "error",
      provider: "google_text_to_speech",
      sentenceId,
      generatedAt: new Date().toISOString(),
      message,
    };
  },
};

describe("createIntegrationContext", () => {
  test("caches frequency lookups by normalized language code", async () => {
    const lookupCalls: string[] = [];
    const baseWordFrequency: WordFrequencyPort = {
      async getLookup(languageCode: string) {
        lookupCalls.push(languageCode);
        return {
          sourceFile: `${languageCode}.csv`,
          getMostCommonWords: () => ["the"],
          getWordFrequency: () => ({
            rank: 1,
            occurrencePercentage: 42,
            rarity: "very_common",
            hint: "Very common",
          }),
        };
      },
    };

    const integrations = createIntegrationContext({
      sentenceSource: NOOP_SENTENCE_SOURCE,
      translation: NOOP_TRANSLATION_PORT,
      speech: NOOP_SPEECH_PORT,
      wordFrequency: baseWordFrequency,
    });

    const firstLookup = await integrations.wordFrequency.getLookup("EN");
    const secondLookup = await integrations.wordFrequency.getLookup(" en ");

    expect(firstLookup.sourceFile).toBe("EN.csv");
    expect(secondLookup.sourceFile).toBe("EN.csv");
    expect(lookupCalls).toEqual(["EN"]);
  });
});
