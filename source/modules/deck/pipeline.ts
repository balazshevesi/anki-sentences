import { formatDuration } from "../shared/formatDuration";
import {
  runAudioMetadataPass,
  runBuildApkgPass,
  runDifficultyPass,
  runSentenceRetrievalPass,
  runTranslationMetadataPass,
} from "./passes";
import type {
  DeckBuildConfig,
  DeckRuntimeConfig,
  PipelinePass,
} from "./types";

export type DeckPipelineConfig = {
  deck: DeckBuildConfig;
  runtime: DeckRuntimeConfig;
  csvPath: string;
  passes: PipelinePass[];
};

async function runStep<T>(
  label: string,
  startMessage: string,
  run: () => Promise<T>,
  summarize: (result: T) => string,
): Promise<T> {
  const startedAt = Date.now();
  console.log(`[${label}] ${startMessage}`);
  const result = await run();
  console.log(
    `[${label}] ${summarize(result)} (${formatDuration(Date.now() - startedAt)})`,
  );
  return result;
}

export async function runDeckPipeline(config: DeckPipelineConfig): Promise<void> {
  const startedAt = Date.now();
  console.log(
    `[pipeline] Starting deck pipeline (${config.csvPath} -> ${config.deck.outputPath})`,
  );

  const runPass: Record<PipelinePass, () => Promise<void>> = {
    retrieve: async () => {
      await runStep(
        "retrieve",
        `Retrieving sentence rows into ${config.csvPath}...`,
        () => runSentenceRetrievalPass(config.deck, config.csvPath, config.runtime),
        (rows) => `Retrieved ${rows.length} sentence rows into ${config.csvPath}`,
      );
    },
    "enrich-translations": async () => {
      await runStep(
        "translations",
        `Adding translation metadata to rows from ${config.csvPath}...`,
        () => runTranslationMetadataPass(config.deck, config.csvPath, config.runtime),
        (rows) =>
          `Added word and n-gram translation metadata to ${rows.length} rows in ${config.csvPath}`,
      );
    },
    "enrich-difficulty": async () => {
      await runStep(
        "difficulty",
        `Calculating difficulty scores for rows from ${config.csvPath}...`,
        () => runDifficultyPass(config.deck, config.csvPath),
        (rows) =>
          `Calculated difficulty scores and sorted ${rows.length} rows in ${config.csvPath}`,
      );
    },
    "enrich-audio": async () => {
      await runStep(
        "audio",
        `Generating Google TTS audio for rows from ${config.csvPath}...`,
        () => runAudioMetadataPass(config.deck, config.csvPath, config.runtime),
        (rows) =>
          `Generated audio metadata for ${rows.length} rows in ${config.csvPath}`,
      );
    },
    "build-apkg": async () => {
      await runStep(
        "build",
        `Building Anki package from ${config.csvPath}...`,
        () => runBuildApkgPass(config.deck, config.csvPath, config.runtime),
        (result) =>
          `Built ${result.cardCount} cards from ${config.csvPath} into ${config.deck.outputPath}`,
      );
    },
  };

  for (const pass of config.passes) {
    await runPass[pass]();
  }

  console.log(
    `[pipeline] Completed deck pipeline in ${formatDuration(Date.now() - startedAt)}`,
  );
}
