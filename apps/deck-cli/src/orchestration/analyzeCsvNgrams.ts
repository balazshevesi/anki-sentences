import { readPipelineCsvRows } from "../deck/csv";
import { countNgrams, toSortedEntries, type NgramStats } from "../deck/ngrams";

const DEFAULT_INPUT_PATH = "../../output/example.csv";
const DEFAULT_TOP_COUNT = 25;

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
      "  bun run src/orchestration/analyzeCsvNgrams.ts [--input=../../output/example.csv] [--top=25]",
      "",
      "Options:",
      `  --input=<path>   Path to generated CSV (default: ${DEFAULT_INPUT_PATH})`,
      `  --top=<int>      Number of rows to print per n-gram size (default: ${DEFAULT_TOP_COUNT})`,
      "  -h, --help       Show this message",
    ].join("\n"),
  );
}

function parseOptions(args: string[]): CliOptions {
  const options: CliOptions = {
    inputPath: DEFAULT_INPUT_PATH,
    topCount: DEFAULT_TOP_COUNT,
  };

  for (const arg of args) {
    if (arg === "-h" || arg === "--help") {
      printUsage();
      process.exit(0);
    }

    if (arg.startsWith("--input=")) {
      options.inputPath = arg.slice("--input=".length);
      continue;
    }

    if (arg.startsWith("--top=")) {
      const topCount = Number.parseInt(arg.slice("--top=".length), 10);
      if (!Number.isSafeInteger(topCount) || topCount <= 0) {
        throw new Error(`--top must be a positive integer. Received: ${arg}`);
      }
      options.topCount = topCount;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function printTopNgrams(
  label: string,
  sortedEntries: Array<[string, NgramStats]>,
  topCount: number,
  totalCardCount: number,
): void {
  console.log(`\n${label}`);
  if (sortedEntries.length === 0) {
    console.log("(none)");
    return;
  }

  sortedEntries.slice(0, topCount).forEach(([ngram, stats], index) => {
    const percentage =
      totalCardCount === 0 ? 0 : (stats.cardCount / totalCardCount) * 100;
    console.log(
      `${index + 1}. ${ngram} (${stats.occurrenceCount} occurrences, ${percentage.toFixed(1)}% of cards)`,
    );
  });
}

async function runAnalyzeCsvNgrams(
  args = process.argv.slice(2),
): Promise<void> {
  const { inputPath, topCount } = parseOptions(args);
  const rows = await readPipelineCsvRows(inputPath);
  const sentences = rows
    .map((row) => row.Sentence.trim())
    .filter((sentence) => sentence.length > 0);

  const bigrams = toSortedEntries(countNgrams(sentences, 2));
  const trigrams = toSortedEntries(countNgrams(sentences, 3));

  console.log(`Read ${sentences.length} sentences from ${inputPath}`);
  printTopNgrams(
    `Top ${topCount} word bigrams:`,
    bigrams,
    topCount,
    sentences.length,
  );
  printTopNgrams(
    `Top ${topCount} word trigrams:`,
    trigrams,
    topCount,
    sentences.length,
  );
}

if (import.meta.main) {
  await runAnalyzeCsvNgrams();
}
