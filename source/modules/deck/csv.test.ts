import { describe, expect, test } from "bun:test";
import {
  parsePipelineCsvRows,
  renderPipelineCsv,
  toApkgPath,
  toCsvPath,
  type PipelineCsvRow,
} from "./csv";

describe("pipeline CSV", () => {
  test("parses legacy CSV headers with safe defaults", () => {
    const rows = parsePipelineCsvRows(
      [
        "Sentence,SentenceTranslation,Keyword,SentenceId,wordByWord",
        '"Hello world","Szia","hello","123","{}"',
      ].join("\n"),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.Sentence).toBe("Hello world");
    expect(rows[0]?.ngramTranslations).toBe("[]");
    expect(rows[0]?.audioMetadata).toBe("[]");
  });

  test("renders and parses pipeline rows roundtrip", () => {
    const inputRows: PipelineCsvRow[] = [
      {
        Sentence: "One sentence",
        SentenceTranslation: "Egy mondat",
        Keyword: "one",
        SentenceId: "42",
        wordByWord: "{}",
        ngramTranslations: "[]",
        audioMetadata: '{"status":"not_implemented"}',
      },
    ];

    const rendered = renderPipelineCsv(inputRows);
    const parsed = parsePipelineCsvRows(rendered);

    expect(parsed).toEqual(inputRows);
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
