import {
  isSupportedLanguageCode,
  SUPPORTED_LANGUAGE_CODES,
  type WordCountFilter,
} from "../sentenceRetrieval/index";
import type { DeckBuildConfig } from "./types";

const DEFAULT_WORD = "must";
const DEFAULT_DECK_NAME = "EN-HU sentence deck";
const DEFAULT_OUTPUT_PATH = "../output/example.apkg";
const DEFAULT_SENTENCE_LANGUAGE = "eng";
const DEFAULT_TRANSLATION_LANGUAGE = "hun";
const DEFAULT_ARGOS_SOURCE = "en";
const DEFAULT_ARGOS_TARGET = "hu";
const DEFAULT_WORD_COUNT = "4-40";
const DEFAULT_LIMIT = 10;
const DEFAULT_ARGOS_HOST = Bun.env.ARGOS_HOST ?? "127.0.0.1";
const DEFAULT_ARGOS_PORT = Bun.env.ARGOS_PORT ?? "8000";
const DEFAULT_ARGOS_TRANSLATE_URL =
  Bun.env.ARGOS_TRANSLATE_URL ??
  `http://${DEFAULT_ARGOS_HOST}:${DEFAULT_ARGOS_PORT}/translate`;

function printUsage(): void {
  const languageExamples = SUPPORTED_LANGUAGE_CODES.slice(0, 8).join(", ");

  console.log(
    [
      "Generate an Anki sentence deck from Tatoeba results.",
      "",
      "Usage:",
      "  bun run index.ts [--word=must] [--output=output/example.apkg]",
      "",
      "Options:",
      "  --word=<text>                Search keyword (default: must)",
      "  --deck-name=<text>           Deck name (default: EN-HU sentence deck)",
      "  --output=<path>              Output .apkg path (default: output/example.apkg)",
      "  --sentence-lang=<code>       Tatoeba sentence language (default: eng)",
      "  --translation-lang=<code>    Tatoeba translation language (default: hun)",
      "  --word-count=<range>         Tatoeba word_count filter (default: 4-40)",
      "  --limit=<int>                Number of cards to fetch (default: 10)",
      "  --argos-source=<code>        Argos source language (default: en)",
      "  --argos-target=<code>        Argos target language (default: hu)",
      `  --argos-url=<url>            Argos endpoint (default: ${DEFAULT_ARGOS_TRANSLATE_URL})`,
      "  -h, --help                   Show this message",
      "",
      `Supported Tatoeba language examples: ${languageExamples}`,
    ].join("\n"),
  );
}

function parseArgs(args: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};

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

    parsed[rawKey] = value;
  }

  return parsed;
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

export function loadDeckBuildConfig(
  args: string[] = process.argv.slice(2),
): DeckBuildConfig {
  const parsed = parseArgs(args);
  const word = (parsed.word ?? DEFAULT_WORD).trim();
  if (word.length === 0) {
    throw new Error("Option --word cannot be empty.");
  }

  const sentenceLanguage = parseLanguageCode(
    parsed["sentence-lang"] ?? DEFAULT_SENTENCE_LANGUAGE,
    "--sentence-lang",
  );
  const translationLanguage = parseLanguageCode(
    parsed["translation-lang"] ?? DEFAULT_TRANSLATION_LANGUAGE,
    "--translation-lang",
  );

  const outputPath = (parsed.output ?? DEFAULT_OUTPUT_PATH).trim();
  if (outputPath.length === 0) {
    throw new Error("Option --output cannot be empty.");
  }

  const deckName = (parsed["deck-name"] ?? DEFAULT_DECK_NAME).trim();
  if (deckName.length === 0) {
    throw new Error("Option --deck-name cannot be empty.");
  }

  return {
    word,
    deckName,
    outputPath,
    sentenceLanguage,
    translationLanguage,
    argosSourceLanguage: parseArgosLanguage(
      parsed["argos-source"] ?? DEFAULT_ARGOS_SOURCE,
      "--argos-source",
    ),
    argosTargetLanguage: parseArgosLanguage(
      parsed["argos-target"] ?? DEFAULT_ARGOS_TARGET,
      "--argos-target",
    ),
    sentenceWordCount: parseWordCountFilter(
      parsed["word-count"] ?? DEFAULT_WORD_COUNT,
    ),
    sentenceLimit: parsePositiveInteger(
      parsed.limit ?? `${DEFAULT_LIMIT}`,
      "--limit",
    ),
    argosTranslateUrl: parsed["argos-url"] ?? DEFAULT_ARGOS_TRANSLATE_URL,
  };
}
