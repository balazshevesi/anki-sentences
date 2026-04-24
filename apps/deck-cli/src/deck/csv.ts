import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { EMPTY_CARD_PAYLOAD_JSON } from "../contracts/cardPayload";

export const DECK_NOTE_FIELDS = [
  "Sentence",
  "SentenceTranslation",
  "Keyword",
  "SentenceId",
  "cardPayload",
  "difficulty",
  "audio",
] as const;

const PIPELINE_CSV_FIELDS = [...DECK_NOTE_FIELDS] as const;

type PipelineCsvField = (typeof PIPELINE_CSV_FIELDS)[number];

export type PipelineCsvRow = Record<PipelineCsvField, string>;

const REQUIRED_PIPELINE_FIELDS = [
  "Sentence",
  "SentenceTranslation",
  "Keyword",
  "SentenceId",
] as const satisfies readonly PipelineCsvField[];

const DEFAULT_PIPELINE_ROW: PipelineCsvRow = {
  Sentence: "",
  SentenceTranslation: "",
  Keyword: "",
  SentenceId: "",
  cardPayload: EMPTY_CARD_PAYLOAD_JSON,
  difficulty: "",
  audio: "",
};

function escapeCsvField(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let inQuotedField = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (!char) {
      continue;
    }

    if (inQuotedField) {
      if (char === '"') {
        const nextChar = content[index + 1];
        if (nextChar === '"') {
          currentValue += '"';
          index += 1;
        } else {
          inQuotedField = false;
        }
      } else {
        currentValue += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotedField = true;
      continue;
    }

    if (char === ",") {
      currentRow.push(currentValue);
      currentValue = "";
      continue;
    }

    if (char === "\n") {
      currentRow.push(currentValue);
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue);
    rows.push(currentRow);
  }

  return rows;
}

function buildHeaderIndex(header: string[]): Map<string, number> {
  return new Map(header.map((column, index) => [column, index]));
}

function assertRequiredColumns(headerIndex: Map<string, number>): void {
  for (const fieldName of REQUIRED_PIPELINE_FIELDS) {
    if (!headerIndex.has(fieldName)) {
      throw new Error(`CSV is missing required '${fieldName}' column.`);
    }
  }
}

export function parsePipelineCsvRows(content: string): PipelineCsvRow[] {
  const rows = parseCsv(content.replace(/^\uFEFF/, ""));
  if (rows.length === 0) {
    throw new Error("CSV is empty.");
  }

  const [header, ...dataRows] = rows;
  const headerIndex = buildHeaderIndex(header ?? []);
  assertRequiredColumns(headerIndex);

  return dataRows
    .filter((row) => row.some((value) => value.trim().length > 0))
    .map((row): PipelineCsvRow => {
      const mapped = { ...DEFAULT_PIPELINE_ROW };

      for (const field of PIPELINE_CSV_FIELDS) {
        const columnIndex = headerIndex.get(field);
        if (columnIndex === undefined) {
          continue;
        }
        mapped[field] = row[columnIndex] ?? DEFAULT_PIPELINE_ROW[field];
      }

      return mapped;
    });
}

export function renderPipelineCsv(rows: PipelineCsvRow[]): string {
  const header = PIPELINE_CSV_FIELDS.join(",");
  const body = rows.map((row) =>
    PIPELINE_CSV_FIELDS.map((field) => escapeCsvField(row[field] ?? "")).join(","),
  );

  return [header, ...body].join("\n");
}

export async function readPipelineCsvRows(csvPath: string): Promise<PipelineCsvRow[]> {
  const file = Bun.file(csvPath);
  if (!(await file.exists())) {
    throw new Error(`CSV file does not exist: ${csvPath}`);
  }

  const content = await file.text();
  return parsePipelineCsvRows(content);
}

export async function writePipelineCsvRows(
  csvPath: string,
  rows: PipelineCsvRow[],
): Promise<void> {
  await mkdir(dirname(csvPath), { recursive: true });
  await Bun.write(csvPath, renderPipelineCsv(rows));
}

export function toCsvPath(value: string): string {
  if (/\.csv$/i.test(value)) {
    return value;
  }

  if (/\.apkg$/i.test(value)) {
    return value.replace(/\.apkg$/i, ".csv");
  }

  return `${value}.csv`;
}

export function toApkgPath(value: string): string {
  if (/\.apkg$/i.test(value)) {
    return value;
  }

  if (/\.csv$/i.test(value)) {
    return value.replace(/\.csv$/i, ".apkg");
  }

  return `${value}.apkg`;
}
