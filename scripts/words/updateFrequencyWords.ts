const DEFAULT_YEAR = "2018";
const DEFAULT_SPECS = ["en:50k", "de:50k", "es:50k"];

const SCRIPT_DIR = new URL("./", import.meta.url);

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
      "  bun run words/updateFrequencyWords.ts",
      "  bun run words/updateFrequencyWords.ts en:50k de:50k",
      "  bun run words/updateFrequencyWords.ts --year=2018 en:full",
      "",
      "Spec format:",
      "  <language>:<size>",
      "  Example: en:50k, zh_cn:50k, en:full",
      "",
      "Output filename:",
      "  <language><size>.txt  (example: en50k.txt)",
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

function parseCliArgs(args: string[]): { year: string; specs: FrequencySpec[] } {
  let year = DEFAULT_YEAR;
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

  const specs = (rawSpecs.length > 0 ? rawSpecs : DEFAULT_SPECS).map(parseSpec);
  return { year, specs };
}

function buildSourceUrl(year: string, spec: FrequencySpec): string {
  return `https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/${year}/${spec.language}/${spec.language}_${spec.size}.txt`;
}

function getOutputPath(spec: FrequencySpec): URL {
  return new URL(`${spec.language}${spec.size}.txt`, SCRIPT_DIR);
}

async function downloadAndWriteWordList(year: string, spec: FrequencySpec): Promise<void> {
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

  await Bun.write(outputPath, body);
  console.log(`Saved ${spec.language}:${spec.size} -> ${outputPath.pathname}`);
}

async function main(): Promise<void> {
  const { year, specs } = parseCliArgs(process.argv.slice(2));

  for (const spec of specs) {
    await downloadAndWriteWordList(year, spec);
  }
}

await main();
