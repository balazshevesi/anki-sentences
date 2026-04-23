import { describe, expect, test } from "bun:test";
import type { WordFrequencyInfo } from "../shared/cardPayload";
import { calculateSentenceDifficultyScore } from "./difficulty";

function frequencyForRank(rank: number | null): WordFrequencyInfo {
  return {
    rank,
    occurrencePercentage: null,
    rarity: rank === null || rank > 20_000 ? "very_rare" : "very_common",
    hint: "",
  };
}

describe("sentence difficulty scoring", () => {
  test("longer sentences score higher when vocabulary is similar", () => {
    const getWordFrequency = () => frequencyForRank(500);

    const shortSentence = calculateSentenceDifficultyScore(
      "I read books.",
      getWordFrequency,
    );
    const longSentence = calculateSentenceDifficultyScore(
      "I read books every evening before I go to bed.",
      getWordFrequency,
    );

    expect(longSentence).toBeGreaterThan(shortSentence);
  });

  test("rarer vocabulary increases score for same sentence length", () => {
    const commonSentence = "This is a short simple sentence.";
    const rareSentence = "This is a short recondite sentence.";

    const commonScore = calculateSentenceDifficultyScore(commonSentence, () =>
      frequencyForRank(500),
    );
    const rareScore = calculateSentenceDifficultyScore(rareSentence, (word) =>
      word.toLowerCase() === "recondite" ? frequencyForRank(45_000) : frequencyForRank(500),
    );

    expect(rareScore).toBeGreaterThan(commonScore);
  });
});
