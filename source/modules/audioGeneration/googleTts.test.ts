import { describe, expect, test } from "bun:test";
import {
  buildSsmlWithWordMarks,
  buildWordTimestamps,
  tokenizeSentenceForSpeech,
} from "./googleTts";

describe("audio helpers", () => {
  test("tokenizeSentenceForSpeech splits by whitespace", () => {
    expect(tokenizeSentenceForSpeech("  Hello   world\nfrom\tBun ")).toEqual([
      "Hello",
      "world",
      "from",
      "Bun",
    ]);
  });

  test("buildSsmlWithWordMarks adds SSML marks and escapes xml", () => {
    const { ssml, markNames } = buildSsmlWithWordMarks(["Tom", "&", "Jerry<3"]);

    expect(markNames).toEqual(["word_0", "word_1", "word_2"]);
    expect(ssml).toContain('<mark name="word_0"/>Tom');
    expect(ssml).toContain('<mark name="word_1"/>&amp;');
    expect(ssml).toContain('<mark name="word_2"/>Jerry&lt;3');
  });

  test("buildWordTimestamps uses next mark as end timestamp", () => {
    const timestamps = buildWordTimestamps(
      ["One", "two", "three"],
      ["word_0", "word_1", "word_2"],
      [
        { markName: "word_0", timeSeconds: 0.12 },
        { markName: "word_1", timeSeconds: 0.47 },
        { markName: "word_2", timeSeconds: 0.92 },
      ],
    );

    expect(timestamps).toEqual([
      { index: 0, token: "One", startMs: 120, endMs: 470 },
      { index: 1, token: "two", startMs: 470, endMs: 920 },
      { index: 2, token: "three", startMs: 920, endMs: null },
    ]);
  });
});
