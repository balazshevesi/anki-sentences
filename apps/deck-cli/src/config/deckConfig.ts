import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";
import { z } from "zod";
import { toApkgPath, toCsvPath } from "../deck/csv";
import type {
  DeckBuildConfig,
  DeckRuntimeConfig,
  PipelinePass,
} from "../deck/types";
import { PIPELINE_PASS_NAMES } from "../deck/types";
import {
  type LanguageCode,
  isSupportedLanguageCode,
  type WordCountFilter,
} from "../integrations/tatoeba/index";

const DEFAULT_DECK_CONFIG_PATH = fileURLToPath(
  new URL("../../deck.config.jsonc", import.meta.url),
);
const DEFAULT_GOOGLE_TRANSLATE_URL =
  "https://translation.googleapis.com/language/translate/v2";

export const DEFAULT_DECK_CONFIG_SCHEMA_PATH = fileURLToPath(
  new URL("../../deck.config.schema.json", import.meta.url),
);

const DeckConfigSchema = z
  .object({
    $schema: z.string().trim().min(1).optional(),
    passes: z.array(z.enum(PIPELINE_PASS_NAMES)).min(1),
    csvPath: z.string().trim().min(1),
    deck: z
      .object({
        name: z.string().trim().min(1),
        outputPath: z.string().trim().min(1),
        words: z.array(z.string().trim().min(1)).min(1),
        sentenceLanguage: z
          .string()
          .trim()
          .min(1)
          .refine(isSupportedLanguageCode, {
            message: "must be a supported Tatoeba language code.",
          }),
        translationLanguage: z
          .string()
          .trim()
          .min(1)
          .refine(isSupportedLanguageCode, {
            message: "must be a supported Tatoeba language code.",
          }),
        sentenceTranslationLimit: z.number().int().positive(),
        sentenceWordCount: z
          .string()
          .trim()
          .min(1)
          .regex(
            /^!?(?:\d+|\d+-\d+|\d+-|-\d+)(?:,(?:\d+|\d+-\d+|\d+-|-\d+)){0,3}$/,
          ),
        sentenceLimit: z.number().int().positive(),
        sentenceExclusions: z.array(z.string().trim().min(1)),
      })
      .strict(),
    translation: z
      .object({
        provider: z.enum(["argos", "google"]),
        sourceLanguage: z
          .string()
          .trim()
          .regex(/^[a-z_]{2,16}$/),
        targetLanguage: z
          .string()
          .trim()
          .regex(/^[a-z_]{2,16}$/),
        argos: z
          .object({
            translateUrl: z.string().trim().min(1).url(),
            cachePath: z.string().trim().min(1).optional(),
            alternatives: z.number().int().nonnegative(),
          })
          .strict(),
        google: z
          .object({
            translateUrl: z.string().trim().min(1).url().optional(),
            cachePath: z.string().trim().min(1).optional(),
            accessToken: z.string().trim().min(1).nullable().optional(),
            apiKey: z.string().trim().min(1).nullable().optional(),
            quotaProject: z.string().trim().min(1).nullable().optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .refine(
        (translation) =>
          translation.provider !== "google" || translation.google,
        "translation.google is required when translation.provider is 'google'.",
      ),
    audio: z
      .object({
        outputDir: z.string().trim().min(1),
        forceRegenerate: z.boolean(),
        accessToken: z.string().trim().min(1).nullable().optional(),
        languageCode: z
          .string()
          .trim()
          .min(1)
          .regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/)
          .nullable()
          .optional(),
        voiceName: z.string().trim().min(1).nullable().optional(),
        speakingRate: z.number().min(0.25).max(2),
        pitch: z.number().min(-20).max(20),
        concurrency: z.number().int().positive(),
        quotaProject: z.string().trim().min(1).nullable().optional(),
      })
      .strict(),
    runtime: z
      .object({
        wordRetrievalConcurrency: z.number().int().positive(),
        sentenceMetadataConcurrency: z.number().int().positive(),
        translationConcurrency: z.number().int().positive(),
        ngramTranslationLimitPerCard: z.number().int().positive(),
        ngramMinCardCount: z.number().int().positive(),
        ngramMinCardPercentage: z.number().min(0),
      })
      .strict(),
    anki: z
      .object({
        sortField: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()
  .transform((config) => ({
    passes: config.passes,
    csvPath: toCsvPath(config.csvPath),
    deck: {
      words: Array.from(new Set(config.deck.words)),
      deckName: config.deck.name,
      outputPath: toApkgPath(config.deck.outputPath),
      sentenceLanguage: config.deck.sentenceLanguage as LanguageCode,
      translationLanguage: config.deck.translationLanguage as LanguageCode,
      sentenceTranslationLimit: config.deck.sentenceTranslationLimit,
      translationProvider: config.translation.provider,
      translationSourceLanguage: config.translation.sourceLanguage,
      translationTargetLanguage: config.translation.targetLanguage,
      argosAlternatives: config.translation.argos.alternatives,
      sentenceWordCount: config.deck.sentenceWordCount as WordCountFilter,
      sentenceLimit: config.deck.sentenceLimit,
      argosTranslateUrl: config.translation.argos.translateUrl,
      argosTranslationCachePath: config.translation.argos.cachePath,
      googleTranslateUrl:
        config.translation.google?.translateUrl ?? DEFAULT_GOOGLE_TRANSLATE_URL,
      googleTranslationCachePath: config.translation.google?.cachePath,
      googleTranslateAccessToken:
        config.translation.google?.accessToken ?? undefined,
      googleTranslateApiKey: config.translation.google?.apiKey ?? undefined,
      googleTranslateQuotaProject:
        config.translation.google?.quotaProject ?? undefined,
      sentenceExclusions: Array.from(
        new Set(
          config.deck.sentenceExclusions.map((value) =>
            value.toLocaleLowerCase(),
          ),
        ),
      ),
      googleTtsAccessToken: config.audio.accessToken ?? undefined,
      googleTtsLanguageCode: config.audio.languageCode ?? undefined,
      googleTtsVoiceName: config.audio.voiceName ?? undefined,
      googleTtsSpeakingRate: config.audio.speakingRate,
      googleTtsPitch: config.audio.pitch,
      audioOutputDir: config.audio.outputDir,
      audioForceRegenerate: config.audio.forceRegenerate,
      googleCloudQuotaProject: config.audio.quotaProject ?? undefined,
    } as DeckBuildConfig,
    runtime: {
      wordRetrievalConcurrency: config.runtime.wordRetrievalConcurrency,
      sentenceMetadataConcurrency: config.runtime.sentenceMetadataConcurrency,
      audioMetadataConcurrency: config.audio.concurrency,
      translationConcurrency: config.runtime.translationConcurrency,
      ngramTranslationLimitPerCard: config.runtime.ngramTranslationLimitPerCard,
      ngramMinCardCount: config.runtime.ngramMinCardCount,
      ngramMinCardPercentage: config.runtime.ngramMinCardPercentage,
      ankiSortField: config.anki.sortField,
    } as DeckRuntimeConfig,
  }));

type LoadedDeckConfig = {
  configPath: string;
  passes: PipelinePass[];
  csvPath: string;
  deck: DeckBuildConfig;
  runtime: DeckRuntimeConfig;
};

export async function loadDeckConfig(
  configPath = Bun.env.DECK_CONFIG_PATH?.trim() || DEFAULT_DECK_CONFIG_PATH,
): Promise<LoadedDeckConfig> {
  const configFile = Bun.file(configPath);
  if (!(await configFile.exists())) {
    throw new Error(
      `Missing deck config at ${configPath}. Create deck.config.jsonc first.`,
    );
  }

  const rawContent = await configFile.text();
  const parseErrors: ParseError[] = [];
  const rawConfig = parse(rawContent, parseErrors, {
    allowTrailingComma: true,
    disallowComments: false,
  });
  if (parseErrors.length > 0) {
    throw new Error(
      `Invalid JSONC in ${configPath}: ${parseErrors
        .map((error) => printParseErrorCode(error.error))
        .join(", ")}`,
    );
  }
  const config = DeckConfigSchema.parse(rawConfig);
  const configDir = dirname(configPath);
  const resolvePath = (value: string): string =>
    isAbsolute(value) ? value : resolve(configDir, value);

  const deck: DeckBuildConfig = {
    ...config.deck,
    outputPath: resolvePath(config.deck.outputPath),
    argosTranslateUrl:
      Bun.env.ARGOS_TRANSLATE_URL?.trim() || config.deck.argosTranslateUrl,
    argosTranslationCachePath: config.deck.argosTranslationCachePath
      ? resolvePath(config.deck.argosTranslationCachePath)
      : undefined,
    googleTranslateUrl:
      Bun.env.GOOGLE_TRANSLATE_URL?.trim() || config.deck.googleTranslateUrl,
    googleTranslationCachePath: config.deck.googleTranslationCachePath
      ? resolvePath(config.deck.googleTranslationCachePath)
      : undefined,
    googleTranslateAccessToken:
      config.deck.googleTranslateAccessToken ??
      Bun.env.GOOGLE_TRANSLATE_ACCESS_TOKEN,
    googleTranslateApiKey:
      config.deck.googleTranslateApiKey ?? Bun.env.GOOGLE_TRANSLATE_API_KEY,
    googleTranslateQuotaProject:
      config.deck.googleTranslateQuotaProject ??
      Bun.env.GOOGLE_TRANSLATE_QUOTA_PROJECT ??
      Bun.env.GOOGLE_CLOUD_QUOTA_PROJECT,
    googleTtsAccessToken:
      config.deck.googleTtsAccessToken ?? Bun.env.GOOGLE_TTS_ACCESS_TOKEN,
    googleTtsLanguageCode:
      config.deck.googleTtsLanguageCode ?? Bun.env.GOOGLE_TTS_LANGUAGE_CODE,
    googleTtsVoiceName:
      config.deck.googleTtsVoiceName ?? Bun.env.GOOGLE_TTS_VOICE,
    audioOutputDir: resolvePath(config.deck.audioOutputDir),
    googleCloudQuotaProject:
      config.deck.googleCloudQuotaProject ?? Bun.env.GOOGLE_CLOUD_QUOTA_PROJECT,
  };

  return {
    configPath,
    passes: config.passes,
    csvPath: resolvePath(config.csvPath),
    deck,
    runtime: config.runtime,
  };
}

function buildDeckConfigJsonSchema(): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(DeckConfigSchema, { io: "input" });
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "DeckConfig",
    ...jsonSchema,
  };
}

export async function writeDeckConfigJsonSchema(
  schemaPath = DEFAULT_DECK_CONFIG_SCHEMA_PATH,
): Promise<void> {
  const schema = buildDeckConfigJsonSchema();
  await Bun.write(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);
}
