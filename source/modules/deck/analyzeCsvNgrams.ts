const DEFAULT_INPUT_PATH = "../output/example.csv";
const DEFAULT_TOP_COUNT = 25;
const SENTENCE_FIELD_NAME = "Sentence";

type CliOptions = {
  inputPath: string;
  topCount: number;
};

function printUsage(): void {
  console.log(
    [
      "Analyze the most common word bigrams and trigrams in a generated deck CSV.",
      "",
      "Usage:",
      "  bun run modules/deck/analyzeCsvNgrams.ts [--input=../output/example.csv] [--top=25]",
      "",
      "Options:",
      `  --input=<path>   Path to generated CSV (default: ${DEFAULT_INPUT_PATH})`,
      `  --top=<int>      Number of rows to print per n-gram size (default: ${DEFAULT_TOP_COUNT})`,
      "  -h, --help       Show this message",
    ].join("\n"),
  );
}

function parsePositiveInteger(rawValue: string, optionName: string): number {
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(
      `${optionName} must be a positive integer. Received: ${rawValue}`,
    );
  }

  return value;
}

function parseCliOptions(args: string[]): CliOptions {
  let inputPath = DEFAULT_INPUT_PATH;
  let topCount = DEFAULT_TOP_COUNT;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    if (!rawKey) {
      throw new Error(`Invalid option: ${arg}`);
    }

    let value = inlineValue;
    if (value === undefined) {
      const nextArg = args[index + 1];
      if (!nextArg || nextArg.startsWith("--")) {
        throw new Error(`Missing value for option --${rawKey}`);
      }
      value = nextArg;
      index += 1;
    }

    if (rawKey === "input") {
      inputPath = value;
      continue;
    }

    if (rawKey === "top") {
      topCount = parsePositiveInteger(value, "--top");
      continue;
    }

    throw new Error(`Unknown option: --${rawKey}`);
  }

  return { inputPath, topCount };
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

function tokenizeWords(input: string): string[] {
  const normalizedInput = input.toLowerCase();
  return normalizedInput.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) ?? [];
}

function countNgrams(sentences: string[], ngramLength: number): Map<string, number> {
  const counts = new Map<string, number>();

  for (const sentence of sentences) {
    const words = tokenizeWords(sentence);
    for (let index = 0; index <= words.length - ngramLength; index += 1) {
      const ngram = words.slice(index, index + ngramLength).join(" ");
      counts.set(ngram, (counts.get(ngram) ?? 0) + 1);
    }
  }

  return counts;
}

function toSortedEntries(counts: Map<string, number>): Array<[string, number]> {
  return Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) {
      return b[1] - a[1];
    }

    return a[0].localeCompare(b[0]);
  });
}

function extractSentenceColumn(rows: string[][]): string[] {
  if (rows.length === 0) {
    throw new Error("CSV is empty.");
  }

  const [header, ...dataRows] = rows;
  const sentenceColumnIndex = header?.indexOf(SENTENCE_FIELD_NAME) ?? -1;
  if (sentenceColumnIndex < 0) {
    throw new Error(`CSV is missing expected '${SENTENCE_FIELD_NAME}' column.`);
  }

  return dataRows
    .map((row) => row[sentenceColumnIndex] ?? "")
    .filter((sentence) => sentence.trim().length > 0);
}

function printTopNgrams(
  label: string,
  sortedEntries: Array<[string, number]>,
  topCount: number,
): void {
  console.log(`\n${label}`);
  if (sortedEntries.length === 0) {
    console.log("(none)");
    return;
  }

  sortedEntries.slice(0, topCount).forEach(([ngram, count], index) => {
    console.log(`${index + 1}. ${ngram} (${count})`);
  });
}

async function runAnalyzeCsvNgrams(args = process.argv.slice(2)): Promise<void> {
  const { inputPath, topCount } = parseCliOptions(args);
  const csvFile = Bun.file(inputPath);
  if (!(await csvFile.exists())) {
    throw new Error(`CSV file does not exist: ${inputPath}`);
  }

  const csvContent = await csvFile.text();
  const rows = parseCsv(csvContent.replace(/^\uFEFF/, ""));
  const sentences = extractSentenceColumn(rows);

  const bigrams = toSortedEntries(countNgrams(sentences, 2));
  const trigrams = toSortedEntries(countNgrams(sentences, 3));

  console.log(`Read ${sentences.length} sentences from ${inputPath}`);
  printTopNgrams(`Top ${topCount} word bigrams:`, bigrams, topCount);
  printTopNgrams(`Top ${topCount} word trigrams:`, trigrams, topCount);
}

if (import.meta.main) {
  await runAnalyzeCsvNgrams();
}

export { runAnalyzeCsvNgrams };
