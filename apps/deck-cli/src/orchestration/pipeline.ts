import { formatDuration } from "../contracts/formatDuration";
import { createIntegrationContext } from "../integrations/createIntegrationContext";
import {
  runAudioMetadataPass,
  runBuildApkgPass,
  runDifficultyPass,
  runSentenceRetrievalPass,
  runTranslationAlternativesPass,
  runTranslationMetadataPass,
} from "./passes";
import type {
  DeckBuildConfig,
  DeckRuntimeConfig,
  PipelinePass,
} from "../deck/types";

export async function runDeckPipeline(config: {
  deck: DeckBuildConfig;
  runtime: DeckRuntimeConfig;
  csvPath: string;
  passes: PipelinePass[];
}): Promise<void> {
  const startedAt = Date.now();
  const integrations = createIntegrationContext({
    translationProvider: config.deck.translationProvider,
  });
  console.log(
    `[pipeline] Starting deck pipeline (${config.csvPath} -> ${config.deck.outputPath})`,
  );

  for (const pass of config.passes) {
    const passStartedAt = Date.now();

    switch (pass) {
      case "retrieve": {
        console.log(
          `[retrieve] Retrieving sentence rows into ${config.csvPath}...`,
        );
        const rows = await runSentenceRetrievalPass(
          config.deck,
          config.csvPath,
          config.runtime,
          integrations,
        );
        console.log(
          `[retrieve] Retrieved ${rows.length} sentence rows into ${config.csvPath} (${formatDuration(Date.now() - passStartedAt)})`,
        );
        break;
      }

      case "enrich-translations": {
        console.log(
          `[translations] Adding translation metadata to rows from ${config.csvPath}...`,
        );
        const rows = await runTranslationMetadataPass(
          config.deck,
          config.csvPath,
          config.runtime,
          integrations,
        );
        console.log(
          `[translations] Added word and n-gram translation metadata to ${rows.length} rows in ${config.csvPath} (${formatDuration(Date.now() - passStartedAt)})`,
        );
        break;
      }

      case "enrich-translation-alternatives": {
        console.log(
          `[translation-alternatives] Adding missing translation alternatives to rows from ${config.csvPath}...`,
        );
        const rows = await runTranslationAlternativesPass(
          config.deck,
          config.csvPath,
          config.runtime,
        );
        console.log(
          `[translation-alternatives] Added missing translation alternatives to ${rows.length} rows in ${config.csvPath} (${formatDuration(Date.now() - passStartedAt)})`,
        );
        break;
      }

      case "enrich-difficulty": {
        console.log(
          `[difficulty] Calculating difficulty scores for rows from ${config.csvPath}...`,
        );
        const rows = await runDifficultyPass(
          config.deck,
          config.csvPath,
          integrations,
        );
        console.log(
          `[difficulty] Calculated difficulty scores and sorted ${rows.length} rows in ${config.csvPath} (${formatDuration(Date.now() - passStartedAt)})`,
        );
        break;
      }

      case "enrich-audio": {
        console.log(
          `[audio] Generating Google TTS audio for rows from ${config.csvPath}...`,
        );
        const rows = await runAudioMetadataPass(
          config.deck,
          config.csvPath,
          config.runtime,
          integrations,
        );
        console.log(
          `[audio] Generated audio metadata for ${rows.length} rows in ${config.csvPath} (${formatDuration(Date.now() - passStartedAt)})`,
        );
        break;
      }

      case "build-apkg": {
        console.log(`[build] Building Anki package from ${config.csvPath}...`);
        const result = await runBuildApkgPass(
          config.deck,
          config.csvPath,
          config.runtime,
        );
        console.log(
          `[build] Built ${result.cardCount} cards from ${config.csvPath} into ${config.deck.outputPath} (${formatDuration(Date.now() - passStartedAt)})`,
        );
        break;
      }

      default: {
        const exhaustivePass: never = pass;
        throw new Error(`Unknown pipeline pass: ${String(exhaustivePass)}`);
      }
    }
  }

  console.log(
    `[pipeline] Completed deck pipeline in ${formatDuration(Date.now() - startedAt)}`,
  );
}
