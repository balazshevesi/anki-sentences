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
  isSupportedLanguageCode,
  type WordCountFilter,
} from "../sentenceRetrieval/index";

export const DEFAULT_DECK_CONFIG_PATH = fileURLToPath(
  new URL("../../deck.config.jsonc", import.meta.url),
);

export const DEFAULT_DECK_CONFIG_SCHEMA_PATH = fileURLToPath(
  new URL("../../deck.config.schema.json", import.meta.url),
);

const NON_EMPTY_STRING = z.string().trim().min(1);
const ARGOS_LANGUAGE = z.string().trim().regex(/^[a-z_]{2,16}$/);
const WORD_COUNT_FILTER_PATTERN = /^!?(?:\d+|\d+-\d+|\d+-|-\d+)(?:,(?:\d+|\d+-\d+|\d+-|-\d+)){0,3}$/;

const DeckConfigSchema = z
  .object({
    passes: z
      .array(z.enum(PIPELINE_PASS_NAMES))
      .min(1)
      .superRefine((passes, context) => {
        const seen = new Set<PipelinePass>();
        for (const pass of passes) {
          if (seen.has(pass)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: `passes must not contain duplicate value '${pass}'.`,
            });
          }
          seen.add(pass);
        }
      }),
    csvPath: NON_EMPTY_STRING,
    deck: z
      .object({
        name: NON_EMPTY_STRING,
        outputPath: NON_EMPTY_STRING,
        words: z.array(NON_EMPTY_STRING).min(1),
        sentenceLanguage: NON_EMPTY_STRING.refine(isSupportedLanguageCode, {
          message: "deck.sentenceLanguage must be a supported Tatoeba language code.",
        }),
        translationLanguage: NON_EMPTY_STRING.refine(isSupportedLanguageCode, {
          message:
            "deck.translationLanguage must be a supported Tatoeba language code.",
        }),
        sentenceTranslationLimit: z.number().int().positive(),
        sentenceWordCount: NON_EMPTY_STRING.regex(WORD_COUNT_FILTER_PATTERN),
        sentenceLimit: z.number().int().positive(),
        sentenceExclusions: z.array(NON_EMPTY_STRING),
      })
      .strict(),
    argos: z
      .object({
        sourceLanguage: ARGOS_LANGUAGE,
        targetLanguage: ARGOS_LANGUAGE,
        alternatives: z.number().int().nonnegative(),
        translateUrl: NON_EMPTY_STRING.url(),
      })
      .strict(),
    audio: z
      .object({
        outputDir: NON_EMPTY_STRING,
        forceRegenerate: z.boolean(),
        accessToken: NON_EMPTY_STRING.nullable().optional(),
        apiKey: NON_EMPTY_STRING.nullable().optional(),
        languageCode: NON_EMPTY_STRING
          .regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/)
          .nullable()
          .optional(),
        voiceName: NON_EMPTY_STRING.nullable().optional(),
        speakingRate: z.number().min(0.25).max(2),
        pitch: z.number().min(-20).max(20),
        concurrency: z.number().int().positive(),
        quotaProject: NON_EMPTY_STRING.nullable().optional(),
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
  .strict();

type DeckConfigInput = z.infer<typeof DeckConfigSchema>;

export type LoadedDeckConfig = {
  configPath: string;
  passes: PipelinePass[];
  csvPath: string;
  deck: DeckBuildConfig;
  runtime: DeckRuntimeConfig;
};

function toLineColumn(content: string, offset: number): string {
  let line = 1;
  let column = 1;

  for (let index = 0; index < offset && index < content.length; index += 1) {
    if (content[index] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }

  return `${line}:${column}`;
}

function parseJsonc(content: string, filePath: string): unknown {
  const errors: ParseError[] = [];
  const parsed = parse(content, errors, {
    allowTrailingComma: true,
    disallowComments: false,
  });

  if (errors.length > 0) {
    const details = errors
      .map((error) => {
        const location = toLineColumn(content, error.offset);
        return `${location} ${printParseErrorCode(error.error)}`;
      })
      .join("\n");
    throw new Error(`Invalid JSONC in ${filePath}:\n${details}`);
  }

  return parsed;
}

function resolveConfigPath(configDir: string, value: string): string {
  const trimmed = value.trim();
  return isAbsolute(trimmed) ? trimmed : resolve(configDir, trimmed);
}

function toUniqueLowercaseTerms(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim().toLocaleLowerCase())
        .filter((value) => value.length > 0),
    ),
  );
}

function toUniqueValues(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}

function mapLoadedConfig(
  input: DeckConfigInput,
  configPath: string,
): LoadedDeckConfig {
  const configDir = dirname(configPath);
  const csvPath = resolveConfigPath(configDir, toCsvPath(input.csvPath));

  return {
    configPath,
    passes: input.passes,
    csvPath,
    deck: {
      words: toUniqueValues(input.deck.words),
      deckName: input.deck.name,
      outputPath: resolveConfigPath(configDir, toApkgPath(input.deck.outputPath)),
      sentenceLanguage: input.deck.sentenceLanguage as DeckBuildConfig["sentenceLanguage"],
      translationLanguage:
        input.deck.translationLanguage as DeckBuildConfig["translationLanguage"],
      sentenceTranslationLimit: input.deck.sentenceTranslationLimit,
      argosSourceLanguage: input.argos.sourceLanguage,
      argosTargetLanguage: input.argos.targetLanguage,
      argosAlternatives: input.argos.alternatives,
      sentenceWordCount: input.deck.sentenceWordCount as WordCountFilter,
      sentenceLimit: input.deck.sentenceLimit,
      argosTranslateUrl: Bun.env.ARGOS_TRANSLATE_URL?.trim() || input.argos.translateUrl,
      sentenceExclusions: toUniqueLowercaseTerms(input.deck.sentenceExclusions),
      googleTtsApiKey: input.audio.apiKey ?? Bun.env.GOOGLE_TTS_API_KEY,
      googleTtsAccessToken:
        input.audio.accessToken ?? Bun.env.GOOGLE_TTS_ACCESS_TOKEN,
      googleTtsLanguageCode: input.audio.languageCode ?? Bun.env.GOOGLE_TTS_LANGUAGE_CODE,
      googleTtsVoiceName: input.audio.voiceName ?? Bun.env.GOOGLE_TTS_VOICE,
      googleTtsSpeakingRate: input.audio.speakingRate,
      googleTtsPitch: input.audio.pitch,
      audioOutputDir: resolveConfigPath(configDir, input.audio.outputDir),
      audioForceRegenerate: input.audio.forceRegenerate,
      googleCloudQuotaProject:
        input.audio.quotaProject ?? Bun.env.GOOGLE_CLOUD_QUOTA_PROJECT,
    },
    runtime: {
      wordRetrievalConcurrency: input.runtime.wordRetrievalConcurrency,
      sentenceMetadataConcurrency: input.runtime.sentenceMetadataConcurrency,
      audioMetadataConcurrency: input.audio.concurrency,
      translationConcurrency: input.runtime.translationConcurrency,
      ngramTranslationLimitPerCard: input.runtime.ngramTranslationLimitPerCard,
      ngramMinCardCount: input.runtime.ngramMinCardCount,
      ngramMinCardPercentage: input.runtime.ngramMinCardPercentage,
      ankiSortField: input.anki.sortField,
    },
  };
}

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
  const rawConfig = parseJsonc(rawContent, configPath);
  const parsedConfig = DeckConfigSchema.parse(rawConfig);

  return mapLoadedConfig(parsedConfig, configPath);
}

export function buildDeckConfigJsonSchema(): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(DeckConfigSchema);
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
