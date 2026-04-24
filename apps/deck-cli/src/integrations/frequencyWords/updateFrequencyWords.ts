const DEFAULT_FREQUENCY_YEAR = "2018";
const DEFAULT_FREQUENCY_SPECS = ["en:50k", "de:50k", "es:50k"];

const SCRIPT_DIR = new URL("./", import.meta.url);

type FrequencyRow = {
  rank: number;
  word: string;
  count: number;
  occurrencePercentage: number;
  cumulativePercentage: number;
};

interface FrequencySpec {
  language: string;
  size: string;
}

function printUsage(): void {
  console.log(
    [
      "Download frequency word lists from https://github.com/hermitdave/FrequencyWords",
      "",
      "Usage:",
      "  bun run src/integrations/frequencyWords/updateFrequencyWords.ts",
      "  bun run src/integrations/frequencyWords/updateFrequencyWords.ts en:50k de:50k",
      "  bun run src/integrations/frequencyWords/updateFrequencyWords.ts --year=2018 en:full",
      "",
      "Spec format:",
      "  <language>:<size>",
      "  Example: en:50k, zh_cn:50k, en:full",
      "",
      "Output filename:",
      "  <language><size>.csv  (example: en50k.csv)",
    ].join("\n"),
  );
}

function isValidToken(value: string): boolean {
  return /^[a-z0-9_]+$/i.test(value);
}

function parseSpec(rawSpec: string): FrequencySpec {
  const [language, size] = rawSpec.split(":");

  if (!language || !size) {
    throw new Error(`Invalid spec \"${rawSpec}\". Expected format <language>:<size>.`);
  }

  if (!isValidToken(language)) {
    throw new Error(`Invalid language token \"${language}\" in spec \"${rawSpec}\".`);
  }

  if (!isValidToken(size)) {
    throw new Error(`Invalid size token \"${size}\" in spec \"${rawSpec}\".`);
  }

  return {
    language: language.toLowerCase(),
    size: size.toLowerCase(),
  };
}

function parseCliArgs(
  args: string[],
): { year: string; specs: FrequencySpec[] } {
  let year = DEFAULT_FREQUENCY_YEAR;
  const rawSpecs: string[] = [];

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    if (arg.startsWith("--year=")) {
      year = arg.slice("--year=".length);
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    rawSpecs.push(arg);
  }

  if (!isValidToken(year)) {
    throw new Error(`Invalid year token: ${year}`);
  }

  const specs = (rawSpecs.length > 0 ? rawSpecs : DEFAULT_FREQUENCY_SPECS).map(
    parseSpec,
  );
  return { year, specs };
}

function buildSourceUrl(year: string, spec: FrequencySpec): string {
  return `https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/${year}/${spec.language}/${spec.language}_${spec.size}.txt`;
}

function getOutputPath(spec: FrequencySpec): URL {
  return new URL(`${spec.language}${spec.size}.csv`, SCRIPT_DIR);
}

function parseSourceRows(body: string): Array<{ word: string; count: number }> {
  const parsedRows: Array<{ word: string; count: number }> = [];

  for (const line of body.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (trimmedLine.length === 0) {
      continue;
    }

    const columns = trimmedLine.split(/\s+/);
    if (columns.length < 2) {
      continue;
    }

    const word = columns[0];
    const rawCount = columns[1];
    if (!word || !rawCount) {
      continue;
    }

    const count = Number.parseInt(rawCount, 10);
    if (!Number.isSafeInteger(count) || count <= 0) {
      continue;
    }

    parsedRows.push({ word, count });
  }

  return parsedRows;
}

function toFrequencyRows(sourceRows: Array<{ word: string; count: number }>): FrequencyRow[] {
  const totalCount = sourceRows.reduce((total, row) => total + row.count, 0);
  if (totalCount <= 0) {
    throw new Error("Downloaded frequency file does not contain valid rows.");
  }

  let cumulativeCount = 0;
  return sourceRows.map((row, index) => {
    cumulativeCount += row.count;

    return {
      rank: index + 1,
      word: row.word,
      count: row.count,
      occurrencePercentage: (row.count / totalCount) * 100,
      cumulativePercentage: (cumulativeCount / totalCount) * 100,
    };
  });
}

function escapeCsvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function renderCsv(rows: FrequencyRow[]): string {
  const header =
    "rank,word,count,occurrence_percentage,cumulative_percentage";
  const body = rows.map((row) =>
    [
      row.rank,
      escapeCsvCell(row.word),
      row.count,
      row.occurrencePercentage.toFixed(8),
      row.cumulativePercentage.toFixed(8),
    ].join(","),
  );

  return [header, ...body].join("\n");
}

async function downloadAndWriteWordList(
  year: string,
  spec: FrequencySpec,
): Promise<void> {
  const sourceUrl = buildSourceUrl(year, spec);
  const outputPath = getOutputPath(spec);

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to download ${sourceUrl} (HTTP ${response.status}).`);
  }

  const body = await response.text();
  if (body.length === 0) {
    throw new Error(`Downloaded file is empty: ${sourceUrl}`);
  }

  const parsedRows = parseSourceRows(body);
  const frequencyRows = toFrequencyRows(parsedRows);
  const renderedCsv = renderCsv(frequencyRows);

  await Bun.write(outputPath, renderedCsv);
  console.log(`Saved ${spec.language}:${spec.size} -> ${outputPath.pathname}`);
}

async function runUpdateFrequencyWords(args = process.argv.slice(2)): Promise<void> {
  const { year, specs } = parseCliArgs(args);

  for (const spec of specs) {
    await downloadAndWriteWordList(year, spec);
  }
}

if (import.meta.main) {
  await runUpdateFrequencyWords();
}
