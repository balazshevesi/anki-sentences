import { describe, expect, test } from "bun:test";
import {
  parsePipelineCsvRows,
  renderPipelineCsv,
  toApkgPath,
  toCsvPath,
  type PipelineCsvRow,
} from "./csv";

describe("pipeline CSV", () => {
  test("parses CSV rows with missing optional columns", () => {
    const rows = parsePipelineCsvRows(
      [
        "Sentence,SentenceTranslation,Keyword,SentenceId",
        '"Hello world","Szia","hello","123"',
      ].join("\n"),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.Sentence).toBe("Hello world");
    expect(rows[0]?.cardPayload).toBe(
      '{"wordByWord":{},"ngramTranslations":[],"audioMetadata":null}',
    );
    expect(rows[0]?.difficulty).toBe("");
  });

  test("renders and parses pipeline rows roundtrip", () => {
    const inputRows: PipelineCsvRow[] = [
      {
        Sentence: "One sentence",
        SentenceTranslation: "Egy mondat",
        Keyword: "one",
        SentenceId: "42",
        cardPayload: '{"wordByWord":{"one":{"translatedText":"egy","alternatives":[],"frequency":{"rank":10,"occurrencePercentage":0.1,"rarity":"very_common","hint":"Very common"}}},"ngramTranslations":[],"audioMetadata":{"status":"error","provider":"google_text_to_speech","sentenceId":"42","generatedAt":"2026-01-01T00:00:00.000Z","message":"not_implemented"}}',
        difficulty: "12.34",
      },
    ];

    const rendered = renderPipelineCsv(inputRows);
    const parsed = parsePipelineCsvRows(rendered);

    expect(parsed).toEqual(inputRows);
  });

  test("migrates legacy audioMetadata column into cardPayload", () => {
    const rows = parsePipelineCsvRows(
      [
        "Sentence,SentenceTranslation,Keyword,SentenceId,cardPayload,difficulty,audioMetadata",
        '"Hello world","Szia","hello","123","{""wordByWord"":{},""ngramTranslations"":[]}","","{""status"":""ready"",""provider"":""google_text_to_speech"",""sentenceId"":""123"",""generatedAt"":""2026-01-01T00:00:00.000Z"",""audioFileName"":""tts-123-aabbccddee.mp3"",""ankiSoundTag"":""[sound:tts-123-aabbccddee.mp3]"",""languageCode"":""en-US"",""voiceName"":null,""speakingRate"":1,""pitch"":0,""words"":[]}"',
      ].join("\n"),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.cardPayload).toBe(
      '{"wordByWord":{},"ngramTranslations":[],"audioMetadata":{"status":"ready","provider":"google_text_to_speech","sentenceId":"123","generatedAt":"2026-01-01T00:00:00.000Z","audioFileName":"tts-123-aabbccddee.mp3","ankiSoundTag":"[sound:tts-123-aabbccddee.mp3]","languageCode":"en-US","voiceName":null,"speakingRate":1,"pitch":0,"words":[]}}',
    );
  });
});

describe("path helpers", () => {
  test("converts between csv and apkg paths", () => {
    expect(toCsvPath("../output/example.apkg")).toBe("../output/example.csv");
    expect(toCsvPath("../output/example")).toBe("../output/example.csv");
    expect(toApkgPath("../output/example.csv")).toBe("../output/example.apkg");
    expect(toApkgPath("../output/example")).toBe("../output/example.apkg");
  });
});
