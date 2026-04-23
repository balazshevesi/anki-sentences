import {
  isSupportedLanguageCode,
  SUPPORTED_LANGUAGE_CODES,
  type WordCountFilter,
} from "./modules/sentenceRetrieval/index";
import { toApkgPath, toCsvPath } from "./modules/deck/csv";
import {
  runAudioMetadataPass,
  runBuildApkgPass,
  runSentenceRetrievalPass,
  runTranslationMetadataPass,
} from "./modules/deck/passes";
import type { DeckBuildConfig } from "./modules/deck/types";

type Command =
  | "retrieve"
  | "enrich-translations"
  | "enrich-audio"
  | "build-apkg"
  | "pipeline";

type CliOptions = {
  words: string[];
  deckName: string;
  csvPath: string;
  outputPath: string;
  sentenceLanguage: DeckBuildConfig["sentenceLanguage"];
  translationLanguage: DeckBuildConfig["translationLanguage"];
  sentenceTranslationLimit: number;
  argosSourceLanguage: string;
  argosTargetLanguage: string;
  argosAlternatives: number;
  sentenceWordCount: WordCountFilter;
  sentenceLimit: number;
  argosTranslateUrl: string;
  skipAudio: boolean;
};

const DEFAULT_WORDS = [
  "must",
  "laughing",
  "wonder",
  "amazing",
  "president",
  "none",
  "station",
  "personal",
  "professor",
  "computer",
  "further",
  "allowed",
];
const DEFAULT_DECK_NAME = "EN-HU sentence deck";
const DEFAULT_OUTPUT_PATH = "../output/example.apkg";
const DEFAULT_SENTENCE_LANGUAGE: DeckBuildConfig["sentenceLanguage"] = "eng";
const DEFAULT_TRANSLATION_LANGUAGE: DeckBuildConfig["translationLanguage"] =
  "hun";
const DEFAULT_SENTENCE_TRANSLATION_LIMIT = 3;
const DEFAULT_ARGOS_SOURCE = "en";
const DEFAULT_ARGOS_TARGET = "hu";
const DEFAULT_ARGOS_ALTERNATIVES = 3;
const DEFAULT_WORD_COUNT = "15-50";
const DEFAULT_LIMIT = 25;
const DEFAULT_ARGOS_HOST = Bun.env.ARGOS_HOST ?? "127.0.0.1";
const DEFAULT_ARGOS_PORT = Bun.env.ARGOS_PORT ?? "8000";
const DEFAULT_ARGOS_TRANSLATE_URL =
  Bun.env.ARGOS_TRANSLATE_URL ??
  `http://${DEFAULT_ARGOS_HOST}:${DEFAULT_ARGOS_PORT}/translate`;

const BOOLEAN_OPTIONS = new Set(["skip-audio"]);
const SUPPORTED_COMMANDS = new Set<Command>([
  "retrieve",
  "enrich-translations",
  "enrich-audio",
  "build-apkg",
  "pipeline",
]);

function printUsage(): void {
  const languageExamples = SUPPORTED_LANGUAGE_CODES.slice(0, 8).join(", ");
  const defaultCsvPath = toCsvPath(DEFAULT_OUTPUT_PATH);

  console.log(
    [
      "Run the deck generation workflow as separate passes.",
      "",
      "Usage:",
      "  bun run cli.ts <command> [options]",
      "",
      "Commands:",
      "  retrieve            Fetch sentences + sentence translations into CSV",
      "  enrich-translations Add word-by-word and n-gram translation metadata",
      "  enrich-audio        Add audio metadata placeholders to CSV",
      "  build-apkg          Convert CSV rows to .apkg deck",
      "  pipeline            Run retrieve -> enrich-translations -> enrich-audio -> build-apkg",
      "",
      "Core options:",
      `  --csv=<path>                  CSV path (default: ${defaultCsvPath})`,
      `  --apkg=<path>                 APKG path (default: ${DEFAULT_OUTPUT_PATH})`,
      "  --output=<path>               Alias of --apkg for backward compatibility",
      `  --word=<text,text,...>        Search keywords (default: ${DEFAULT_WORDS.join(",")})`,
      "  --deck-name=<text>            Deck name",
      "",
      "Sentence retrieval options:",
      `  --sentence-lang=<code>        Tatoeba sentence language (default: ${DEFAULT_SENTENCE_LANGUAGE})`,
      `  --translation-lang=<code>     Tatoeba translation language (default: ${DEFAULT_TRANSLATION_LANGUAGE})`,
      `  --sentence-translations=<int> Max sentence translations per row (default: ${DEFAULT_SENTENCE_TRANSLATION_LIMIT})`,
      `  --word-count=<range>          Tatoeba word_count filter (default: ${DEFAULT_WORD_COUNT})`,
      `  --limit=<int>                 Sentences to fetch per keyword (default: ${DEFAULT_LIMIT})`,
      "",
      "Translation metadata options:",
      `  --argos-source=<code>         Argos source language (default: ${DEFAULT_ARGOS_SOURCE})`,
      `  --argos-target=<code>         Argos target language (default: ${DEFAULT_ARGOS_TARGET})`,
      `  --argos-alternatives=<int>    Alt translations per token (default: ${DEFAULT_ARGOS_ALTERNATIVES})`,
      `  --argos-url=<url>             Argos endpoint (default: ${DEFAULT_ARGOS_TRANSLATE_URL})`,
      "",
      "Pipeline options:",
      "  --skip-audio                  Skip enrich-audio step in pipeline",
      "  -h, --help                    Show this message",
      "",
      `Supported Tatoeba language examples: ${languageExamples}`,
    ].join("\n"),
  );
}

function parseRawArgs(args: string[]): Map<string, string[]> {
  const parsed = new Map<string, string[]>();

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
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
      if (BOOLEAN_OPTIONS.has(rawKey)) {
        value = "true";
      } else {
        const nextArg = args[index + 1];
        if (!nextArg || nextArg.startsWith("--")) {
          throw new Error(`Missing value for option --${rawKey}`);
        }
        value = nextArg;
        index += 1;
      }
    }

    const values = parsed.get(rawKey) ?? [];
    values.push(value);
    parsed.set(rawKey, values);
  }

  return parsed;
}

function getLastValue(
  options: Map<string, string[]>,
  key: string,
): string | undefined {
  const values = options.get(key);
  return values?.[values.length - 1];
}

function parsePositiveInteger(rawValue: string, optionName: string): number {
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(
      `Option ${optionName} must be a positive integer. Received: ${rawValue}`,
    );
  }
  return value;
}

function parseNonNegativeInteger(rawValue: string, optionName: string): number {
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      `Option ${optionName} must be a non-negative integer. Received: ${rawValue}`,
    );
  }

  return value;
}

function parseLanguageCode(
  rawValue: string,
  optionName: string,
): DeckBuildConfig["sentenceLanguage"] {
  if (!isSupportedLanguageCode(rawValue)) {
    throw new Error(
      `Option ${optionName} must be a supported Tatoeba language code. Received: ${rawValue}`,
    );
  }

  return rawValue;
}

function parseArgosLanguage(rawValue: string, optionName: string): string {
  const value = rawValue.trim().toLowerCase();
  if (!/^[a-z_]{2,16}$/.test(value)) {
    throw new Error(
      `Option ${optionName} must contain only lowercase letters or underscore. Received: ${rawValue}`,
    );
  }

  return value;
}

function parseWordCountFilter(rawValue: string): WordCountFilter {
  const value = rawValue.trim();
  const token = "(?:\\d+|\\d+-\\d+|\\d+-|-\\d+)";
  const pattern = new RegExp(`^!?${token}(?:,${token}){0,3}$`);
  if (!pattern.test(value)) {
    throw new Error(
      `Option --word-count must follow Tatoeba word_count syntax. Received: ${rawValue}`,
    );
  }

  return value as WordCountFilter;
}

function parseWordList(rawValues: string[] | undefined): string[] {
  const joined =
    rawValues && rawValues.length > 0
      ? rawValues.join(",")
      : DEFAULT_WORDS.join(",");

  const words = joined
    .split(",")
    .map((word) => word.trim())
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    throw new Error(
      "Option --word must include at least one non-empty keyword.",
    );
  }

  return Array.from(new Set(words));
}

function parseCliOptions(args: string[]): CliOptions {
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const parsed = parseRawArgs(args);
  const words = parseWordList(parsed.get("word"));

  const explicitCsv = getLastValue(parsed, "csv");
  const explicitApkg =
    getLastValue(parsed, "apkg") ?? getLastValue(parsed, "output");

  const outputPath = toApkgPath(
    explicitApkg ?? explicitCsv ?? DEFAULT_OUTPUT_PATH,
  );
  const csvPath = toCsvPath(explicitCsv ?? explicitApkg ?? DEFAULT_OUTPUT_PATH);

  const deckName = (
    getLastValue(parsed, "deck-name") ?? DEFAULT_DECK_NAME
  ).trim();
  if (deckName.length === 0) {
    throw new Error("Option --deck-name cannot be empty.");
  }

  return {
    words,
    deckName,
    csvPath,
    outputPath,
    sentenceLanguage: parseLanguageCode(
      getLastValue(parsed, "sentence-lang") ?? DEFAULT_SENTENCE_LANGUAGE,
      "--sentence-lang",
    ),
    translationLanguage: parseLanguageCode(
      getLastValue(parsed, "translation-lang") ?? DEFAULT_TRANSLATION_LANGUAGE,
      "--translation-lang",
    ),
    sentenceTranslationLimit: parsePositiveInteger(
      getLastValue(parsed, "sentence-translations") ??
        `${DEFAULT_SENTENCE_TRANSLATION_LIMIT}`,
      "--sentence-translations",
    ),
    argosSourceLanguage: parseArgosLanguage(
      getLastValue(parsed, "argos-source") ?? DEFAULT_ARGOS_SOURCE,
      "--argos-source",
    ),
    argosTargetLanguage: parseArgosLanguage(
      getLastValue(parsed, "argos-target") ?? DEFAULT_ARGOS_TARGET,
      "--argos-target",
    ),
    argosAlternatives: parseNonNegativeInteger(
      getLastValue(parsed, "argos-alternatives") ??
        `${DEFAULT_ARGOS_ALTERNATIVES}`,
      "--argos-alternatives",
    ),
    sentenceWordCount: parseWordCountFilter(
      getLastValue(parsed, "word-count") ?? DEFAULT_WORD_COUNT,
    ),
    sentenceLimit: parsePositiveInteger(
      getLastValue(parsed, "limit") ?? `${DEFAULT_LIMIT}`,
      "--limit",
    ),
    argosTranslateUrl:
      getLastValue(parsed, "argos-url") ?? DEFAULT_ARGOS_TRANSLATE_URL,
    skipAudio: getLastValue(parsed, "skip-audio") === "true",
  };
}

function toDeckBuildConfig(options: CliOptions): DeckBuildConfig {
  return {
    words: options.words,
    deckName: options.deckName,
    outputPath: options.outputPath,
    sentenceLanguage: options.sentenceLanguage,
    translationLanguage: options.translationLanguage,
    sentenceTranslationLimit: options.sentenceTranslationLimit,
    argosSourceLanguage: options.argosSourceLanguage,
    argosTargetLanguage: options.argosTargetLanguage,
    argosAlternatives: options.argosAlternatives,
    sentenceWordCount: options.sentenceWordCount,
    sentenceLimit: options.sentenceLimit,
    argosTranslateUrl: options.argosTranslateUrl,
  };
}

function resolveCommand(rawArgs: string[]): {
  command: Command;
  optionArgs: string[];
} {
  const [firstArg, ...rest] = rawArgs;

  if (!firstArg || firstArg.startsWith("--")) {
    return {
      command: "pipeline",
      optionArgs: rawArgs,
    };
  }

  if (firstArg === "help") {
    printUsage();
    process.exit(0);
  }

  if (!SUPPORTED_COMMANDS.has(firstArg as Command)) {
    throw new Error(`Unknown command: ${firstArg}`);
  }

  return {
    command: firstArg as Command,
    optionArgs: rest,
  };
}

export async function runCli(rawArgs = process.argv.slice(2)): Promise<void> {
  const { command, optionArgs } = resolveCommand(rawArgs);
  const options = parseCliOptions(optionArgs);
  const config = toDeckBuildConfig(options);

  if (command === "retrieve") {
    const rows = await runSentenceRetrievalPass(config, options.csvPath);
    console.log(
      `Retrieved ${rows.length} sentence rows into ${options.csvPath}`,
    );
    return;
  }

  if (command === "enrich-translations") {
    const rows = await runTranslationMetadataPass(config, options.csvPath);
    console.log(
      `Added word and n-gram translation metadata to ${rows.length} rows in ${options.csvPath}`,
    );
    return;
  }

  if (command === "enrich-audio") {
    const rows = await runAudioMetadataPass(options.csvPath);
    console.log(
      `Added audio metadata placeholders to ${rows.length} rows in ${options.csvPath}`,
    );
    return;
  }

  if (command === "build-apkg") {
    const result = await runBuildApkgPass(config, options.csvPath);
    console.log(
      `Built ${result.cardCount} cards from ${options.csvPath} into ${options.outputPath}`,
    );
    return;
  }

  if (command !== "pipeline") {
    throw new Error(`Unsupported command: ${command}`);
  }

  const retrievedRows = await runSentenceRetrievalPass(config, options.csvPath);
  console.log(
    `Retrieved ${retrievedRows.length} sentence rows into ${options.csvPath}`,
  );

  const translatedRows = await runTranslationMetadataPass(
    config,
    options.csvPath,
  );
  console.log(
    `Added word and n-gram translation metadata to ${translatedRows.length} rows in ${options.csvPath}`,
  );

  if (!options.skipAudio) {
    const audioRows = await runAudioMetadataPass(options.csvPath);
    console.log(
      `Added audio metadata placeholders to ${audioRows.length} rows in ${options.csvPath}`,
    );
  }

  const buildResult = await runBuildApkgPass(config, options.csvPath);
  console.log(
    `Built ${buildResult.cardCount} cards from ${options.csvPath} into ${options.outputPath}`,
  );
}

if (import.meta.main) {
  await runCli();
}
