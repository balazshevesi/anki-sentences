import type { DeckBuildConfig } from "../deck/types";
import type { CommandDefinition } from "./types";

export const DEFAULT_WORDS = [
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

export const DEFAULT_DECK_NAME = "EN-HU sentence deck";
export const DEFAULT_OUTPUT_PATH = "../output/example.apkg";
export const DEFAULT_SENTENCE_LANGUAGE: DeckBuildConfig["sentenceLanguage"] =
  "eng";
export const DEFAULT_TRANSLATION_LANGUAGE: DeckBuildConfig["translationLanguage"] =
  "hun";
export const DEFAULT_SENTENCE_TRANSLATION_LIMIT = 3;
export const DEFAULT_ARGOS_SOURCE = "en";
export const DEFAULT_ARGOS_TARGET = "hu";
export const DEFAULT_ARGOS_ALTERNATIVES = 3;
export const DEFAULT_WORD_COUNT = "15-50";
export const DEFAULT_LIMIT = 25;
export const DEFAULT_ARGOS_HOST = Bun.env.ARGOS_HOST ?? "127.0.0.1";
export const DEFAULT_ARGOS_PORT = Bun.env.ARGOS_PORT ?? "8000";
export const DEFAULT_ARGOS_TRANSLATE_URL =
  Bun.env.ARGOS_TRANSLATE_URL ??
  `http://${DEFAULT_ARGOS_HOST}:${DEFAULT_ARGOS_PORT}/translate`;
export const DEFAULT_GOOGLE_TTS_API_KEY = Bun.env.GOOGLE_TTS_API_KEY;
export const DEFAULT_GOOGLE_TTS_ACCESS_TOKEN = Bun.env.GOOGLE_TTS_ACCESS_TOKEN;
export const DEFAULT_GOOGLE_TTS_LANGUAGE_CODE =
  Bun.env.GOOGLE_TTS_LANGUAGE_CODE;
export const DEFAULT_GOOGLE_TTS_VOICE = Bun.env.GOOGLE_TTS_VOICE;
export const DEFAULT_GOOGLE_TTS_SPEAKING_RATE =
  Bun.env.GOOGLE_TTS_SPEAKING_RATE ?? "1";
export const DEFAULT_GOOGLE_TTS_PITCH = Bun.env.GOOGLE_TTS_PITCH ?? "0";

export const DEFAULT_SENTENCE_EXCLUSIONS = [] as const;

export const COMMAND_DEFINITIONS: CommandDefinition[] = [
  {
    name: "retrieve",
    description: "Fetch sentences and sentence translations into CSV",
  },
  {
    name: "enrich-translations",
    description: "Add word-by-word and n-gram translation metadata to CSV",
  },
  {
    name: "enrich-difficulty",
    description: "Calculate sentence difficulty scores and sort CSV ascending",
  },
  {
    name: "enrich-audio",
    description: "Generate Google TTS audio files and per-word timestamps",
  },
  {
    name: "build-apkg",
    description: "Convert CSV rows into APKG",
  },
  {
    name: "pipeline",
    description:
      "Run retrieve -> enrich-translations -> enrich-difficulty -> enrich-audio -> build-apkg",
  },
];
