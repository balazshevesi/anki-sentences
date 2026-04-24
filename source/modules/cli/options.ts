import type { Command as CacCommand } from "cac";
import { basename, dirname, join } from "node:path";
import { isSupportedLanguageCode, type WordCountFilter } from "../sentenceRetrieval/index";
import { toApkgPath, toCsvPath } from "../deck/csv";
import { resolveGoogleTtsLanguageCode } from "../audioGeneration/index";
import {
  DEFAULT_ARGOS_ALTERNATIVES,
  DEFAULT_ARGOS_SOURCE,
  DEFAULT_ARGOS_TARGET,
  DEFAULT_ARGOS_TRANSLATE_URL,
  DEFAULT_DECK_NAME,
  DEFAULT_LIMIT,
  DEFAULT_OUTPUT_PATH,
  DEFAULT_GOOGLE_TTS_API_KEY,
  DEFAULT_GOOGLE_TTS_ACCESS_TOKEN,
  DEFAULT_GOOGLE_TTS_LANGUAGE_CODE,
  DEFAULT_GOOGLE_TTS_PITCH,
  DEFAULT_GOOGLE_TTS_SPEAKING_RATE,
  DEFAULT_GOOGLE_TTS_VOICE,
  DEFAULT_SENTENCE_EXCLUSIONS,
  DEFAULT_SENTENCE_LANGUAGE,
  DEFAULT_SENTENCE_TRANSLATION_LIMIT,
  DEFAULT_TRANSLATION_LANGUAGE,
  DEFAULT_WORD_COUNT,
  DEFAULT_WORDS,
} from "./defaults";
import type { CliOptions, RawCliOptions } from "./types";

export function addCommonOptions(command: CacCommand): void {
  command
    .option("--csv <path>", "CSV path")
    .option("--apkg <path>", "APKG path")
    .option("--output <path>", "Alias for --apkg (backward compatibility)")
    .option("--word <text,text,...>", "Search keywords")
    .option("--deck-name <text>", "Deck name")
    .option("--sentence-lang <code>", "Tatoeba sentence language")
    .option("--translation-lang <code>", "Tatoeba translation language")
    .option("--sentence-translations <int>", "Sentence translations per row")
    .option("--word-count <range>", "Tatoeba word_count filter")
    .option("--limit <int>", "Sentences to fetch per keyword")
    .option("--argos-source <code>", "Argos source language")
    .option("--argos-target <code>", "Argos target language")
    .option("--argos-alternatives <int>", "Alternative translations per token")
    .option("--argos-url <url>", "Argos endpoint URL")
    .option("--google-tts-api-key <key>", "Legacy Google Text-to-Speech API key (deprecated)")
    .option("--google-tts-access-token <token>", "OAuth2 bearer token for Google Text-to-Speech")
    .option("--google-tts-language-code <code>", "Google Text-to-Speech language code")
    .option("--google-tts-voice <name>", "Google Text-to-Speech voice name")
    .option("--google-tts-speaking-rate <float>", "Google Text-to-Speech speaking rate")
    .option("--google-tts-pitch <float>", "Google Text-to-Speech pitch")
    .option("--audio-dir <path>", "Directory for generated audio files")
    .option("--audio-force", "Force regenerate audio even if metadata exists")
    .option("--sentence-exclusions <text,text,...>", "Exclude sentences containing terms")
    .option("--exclude-politics", "Add default political sentence exclusions")
    .option("--skip-audio", "Skip enrich-audio during pipeline");
}

function getOptionalString(rawValue: unknown, optionName: string): string | undefined {
  if (rawValue === undefined || rawValue === null) {
    return undefined;
  }

  if (typeof rawValue !== "string") {
    throw new Error(`Option ${optionName} must be a string.`);
  }

  return rawValue;
}

function parsePositiveInteger(rawValue: unknown, optionName: string): number {
  const raw = typeof rawValue === "number" ? `${rawValue}` : String(rawValue);
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Option ${optionName} must be a positive integer. Received: ${raw}`);
  }

  return value;
}

function parseNonNegativeInteger(rawValue: unknown, optionName: string): number {
  const raw = typeof rawValue === "number" ? `${rawValue}` : String(rawValue);
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      `Option ${optionName} must be a non-negative integer. Received: ${raw}`,
    );
  }

  return value;
}

function parseLanguageCode(rawValue: unknown, optionName: string): CliOptions["sentenceLanguage"] {
  const value = getOptionalString(rawValue, optionName);
  if (!value || !isSupportedLanguageCode(value)) {
    throw new Error(
      `Option ${optionName} must be a supported Tatoeba language code. Received: ${String(rawValue)}`,
    );
  }

  return value;
}

function parseArgosLanguage(rawValue: unknown, optionName: string): string {
  const value = getOptionalString(rawValue, optionName)?.trim().toLowerCase();
  if (!value || !/^[a-z_]{2,16}$/.test(value)) {
    throw new Error(
      `Option ${optionName} must contain only lowercase letters or underscore. Received: ${String(rawValue)}`,
    );
  }

  return value;
}

function parseOptionalTrimmedString(
  rawValue: unknown,
  optionName: string,
): string | undefined {
  const value = getOptionalString(rawValue, optionName)?.trim();
  if (!value || value.length === 0) {
    return undefined;
  }

  return value;
}

function parseOptionalGoogleTtsLanguageCode(rawValue: unknown): string | undefined {
  const value = parseOptionalTrimmedString(rawValue, "--google-tts-language-code");
  if (!value) {
    return undefined;
  }

  if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/.test(value)) {
    throw new Error(
      `Option --google-tts-language-code must look like a BCP-47 tag (for example: en-US). Received: ${String(rawValue)}`,
    );
  }

  return value;
}

function parseFloatWithinRange(
  rawValue: unknown,
  optionName: string,
  min: number,
  max: number,
): number {
  const raw = typeof rawValue === "number" ? `${rawValue}` : String(rawValue);
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(
      `Option ${optionName} must be between ${min} and ${max}. Received: ${raw}`,
    );
  }

  return value;
}

function parseWordCountFilter(rawValue: unknown): WordCountFilter {
  const value = getOptionalString(rawValue, "--word-count")?.trim();
  const token = "(?:\\d+|\\d+-\\d+|\\d+-|-\\d+)";
  const pattern = new RegExp(`^!?${token}(?:,${token}){0,3}$`);
  if (!value || !pattern.test(value)) {
    throw new Error(
      `Option --word-count must follow Tatoeba word_count syntax. Received: ${String(rawValue)}`,
    );
  }

  return value as WordCountFilter;
}

function parseWordList(rawValue: unknown): string[] {
  const source = Array.isArray(rawValue)
    ? rawValue.map((item) => String(item)).join(",")
    : typeof rawValue === "string"
      ? rawValue
      : DEFAULT_WORDS.join(",");

  const words = source
    .split(",")
    .map((word) => word.trim())
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    throw new Error("Option --word must include at least one non-empty keyword.");
  }

  return Array.from(new Set(words));
}

function parseSentenceExclusionTerms(rawValue: unknown): string[] {
  const source = Array.isArray(rawValue)
    ? rawValue.map((item) => String(item)).join(",")
    : typeof rawValue === "string"
      ? rawValue
      : "";

  return Array.from(
    new Set(
      source
        .split(",")
        .map((term) => term.trim().toLocaleLowerCase())
        .filter((term) => term.length > 0),
    ),
  );
}

export function parseCliOptions(rawOptions: RawCliOptions): CliOptions {
  const words = parseWordList(rawOptions.word);
  const customSentenceExclusions = parseSentenceExclusionTerms(
    rawOptions.sentenceExclusions,
  );
  const sentenceExclusions = Array.from(
    new Set(
      rawOptions.excludePolitics === true
        ? [
          ...DEFAULT_SENTENCE_EXCLUSIONS,
          ...customSentenceExclusions,
        ]
        : customSentenceExclusions,
    ),
  );

  const explicitCsv = getOptionalString(rawOptions.csv, "--csv");
  const explicitApkg =
    getOptionalString(rawOptions.apkg, "--apkg") ??
    getOptionalString(rawOptions.output, "--output");

  const outputPath = toApkgPath(explicitApkg ?? explicitCsv ?? DEFAULT_OUTPUT_PATH);
  const csvPath = toCsvPath(explicitCsv ?? explicitApkg ?? DEFAULT_OUTPUT_PATH);
  const csvBaseName = basename(csvPath).replace(/\.csv$/i, "");
  const defaultAudioOutputDir = join(dirname(csvPath), `${csvBaseName}-audio`);

  const deckName =
    (getOptionalString(rawOptions.deckName, "--deck-name") ?? DEFAULT_DECK_NAME).trim();
  if (deckName.length === 0) {
    throw new Error("Option --deck-name cannot be empty.");
  }

  const sentenceLanguage = parseLanguageCode(
    rawOptions.sentenceLang ?? DEFAULT_SENTENCE_LANGUAGE,
    "--sentence-lang",
  );

  const inferredGoogleTtsLanguage = resolveGoogleTtsLanguageCode(sentenceLanguage);
  const googleTtsLanguageCode = parseOptionalGoogleTtsLanguageCode(
    rawOptions.googleTtsLanguageCode ??
      DEFAULT_GOOGLE_TTS_LANGUAGE_CODE ??
      inferredGoogleTtsLanguage,
  );

  const googleTtsApiKey = parseOptionalTrimmedString(
    rawOptions.googleTtsApiKey ?? DEFAULT_GOOGLE_TTS_API_KEY,
    "--google-tts-api-key",
  );

  const googleTtsAccessToken = parseOptionalTrimmedString(
    rawOptions.googleTtsAccessToken ?? DEFAULT_GOOGLE_TTS_ACCESS_TOKEN,
    "--google-tts-access-token",
  );

  const googleTtsVoiceName = parseOptionalTrimmedString(
    rawOptions.googleTtsVoice ?? DEFAULT_GOOGLE_TTS_VOICE,
    "--google-tts-voice",
  );

  const googleTtsSpeakingRate = parseFloatWithinRange(
    rawOptions.googleTtsSpeakingRate ?? DEFAULT_GOOGLE_TTS_SPEAKING_RATE,
    "--google-tts-speaking-rate",
    0.25,
    2,
  );

  const googleTtsPitch = parseFloatWithinRange(
    rawOptions.googleTtsPitch ?? DEFAULT_GOOGLE_TTS_PITCH,
    "--google-tts-pitch",
    -20,
    20,
  );

  const audioOutputDir =
    parseOptionalTrimmedString(rawOptions.audioDir, "--audio-dir") ??
    defaultAudioOutputDir;

  return {
    words,
    deckName,
    csvPath,
    outputPath,
    sentenceLanguage,
    translationLanguage: parseLanguageCode(
      rawOptions.translationLang ?? DEFAULT_TRANSLATION_LANGUAGE,
      "--translation-lang",
    ),
    sentenceTranslationLimit: parsePositiveInteger(
      rawOptions.sentenceTranslations ?? DEFAULT_SENTENCE_TRANSLATION_LIMIT,
      "--sentence-translations",
    ),
    argosSourceLanguage: parseArgosLanguage(
      rawOptions.argosSource ?? DEFAULT_ARGOS_SOURCE,
      "--argos-source",
    ),
    argosTargetLanguage: parseArgosLanguage(
      rawOptions.argosTarget ?? DEFAULT_ARGOS_TARGET,
      "--argos-target",
    ),
    argosAlternatives: parseNonNegativeInteger(
      rawOptions.argosAlternatives ?? DEFAULT_ARGOS_ALTERNATIVES,
      "--argos-alternatives",
    ),
    sentenceWordCount: parseWordCountFilter(rawOptions.wordCount ?? DEFAULT_WORD_COUNT),
    sentenceLimit: parsePositiveInteger(rawOptions.limit ?? DEFAULT_LIMIT, "--limit"),
    argosTranslateUrl:
      getOptionalString(rawOptions.argosUrl, "--argos-url") ??
      DEFAULT_ARGOS_TRANSLATE_URL,
    googleTtsApiKey,
    googleTtsAccessToken,
    googleTtsLanguageCode,
    googleTtsVoiceName,
    googleTtsSpeakingRate,
    googleTtsPitch,
    audioOutputDir,
    audioForceRegenerate: rawOptions.audioForce === true,
    sentenceExclusions,
    skipAudio: rawOptions.skipAudio === true,
  };
}

export function normalizeRawArgs(rawArgs: string[]): string[] {
  const [firstArg, ...rest] = rawArgs;

  if (!firstArg) {
    return ["pipeline"];
  }

  if (firstArg === "help") {
    if (rest.length === 0) {
      return ["--help"];
    }

    const [commandName, ...helpRest] = rest;
    if (!commandName) {
      return ["--help"];
    }

    return [commandName, "--help", ...helpRest];
  }

  if (firstArg.startsWith("-")) {
    if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
      return ["--help"];
    }

    return ["pipeline", ...rawArgs];
  }

  return rawArgs;
}
