import {
  runAudioMetadataPass,
  runBuildApkgPass,
  runDifficultyPass,
  runSentenceRetrievalPass,
  runTranslationMetadataPass,
} from "../deck/passes";
import type { DeckBuildConfig } from "../deck/types";
import { formatDuration } from "../shared/formatDuration";
import type { CliOptions, PipelineCommand } from "./types";

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
    sentenceExclusions: options.sentenceExclusions,
  };
}

export async function runCommand(command: PipelineCommand, options: CliOptions): Promise<void> {
  const config = toDeckBuildConfig(options);

  if (command === "retrieve") {
    await runStep(
      "retrieve",
      `Retrieving sentence rows into ${options.csvPath}...`,
      () => runSentenceRetrievalPass(config, options.csvPath),
      (rows) => `Retrieved ${rows.length} sentence rows into ${options.csvPath}`,
    );
    return;
  }

  if (command === "enrich-translations") {
    await runStep(
      "translations",
      `Adding translation metadata to rows from ${options.csvPath}...`,
      () => runTranslationMetadataPass(config, options.csvPath),
      (rows) =>
        `Added word and n-gram translation metadata to ${rows.length} rows in ${options.csvPath}`,
    );
    return;
  }

  if (command === "enrich-audio") {
    await runStep(
      "audio",
      `Adding audio metadata placeholders to rows from ${options.csvPath}...`,
      () => runAudioMetadataPass(options.csvPath),
      (rows) =>
        `Added audio metadata placeholders to ${rows.length} rows in ${options.csvPath}`,
    );
    return;
  }

  if (command === "enrich-difficulty") {
    await runStep(
      "difficulty",
      `Calculating difficulty scores for rows from ${options.csvPath}...`,
      () => runDifficultyPass(config, options.csvPath),
      (rows) =>
        `Calculated difficulty scores and sorted ${rows.length} rows in ${options.csvPath}`,
    );
    return;
  }

  if (command === "build-apkg") {
    await runStep(
      "build",
      `Building Anki package from ${options.csvPath}...`,
      () => runBuildApkgPass(config, options.csvPath),
      (result) =>
        `Built ${result.cardCount} cards from ${options.csvPath} into ${options.outputPath}`,
    );
    return;
  }

  const pipelineStartedAt = Date.now();
  console.log(`[pipeline] Starting deck pipeline (${options.csvPath} -> ${options.outputPath})`);

  await runStep(
    "retrieve",
    `Retrieving sentence rows into ${options.csvPath}...`,
    () => runSentenceRetrievalPass(config, options.csvPath),
    (rows) => `Retrieved ${rows.length} sentence rows into ${options.csvPath}`,
  );

  await runStep(
    "translations",
    `Adding translation metadata to rows from ${options.csvPath}...`,
    () => runTranslationMetadataPass(config, options.csvPath),
    (rows) =>
      `Added word and n-gram translation metadata to ${rows.length} rows in ${options.csvPath}`,
  );

  await runStep(
    "difficulty",
    `Calculating difficulty scores for rows from ${options.csvPath}...`,
    () => runDifficultyPass(config, options.csvPath),
    (rows) =>
      `Calculated difficulty scores and sorted ${rows.length} rows in ${options.csvPath}`,
  );

  if (!options.skipAudio) {
    await runStep(
      "audio",
      `Adding audio metadata placeholders to rows from ${options.csvPath}...`,
      () => runAudioMetadataPass(options.csvPath),
      (rows) =>
        `Added audio metadata placeholders to ${rows.length} rows in ${options.csvPath}`,
    );
  } else {
    console.log("[audio] Skipped audio metadata pass (--skip-audio).");
  }

  await runStep(
    "build",
    `Building Anki package from ${options.csvPath}...`,
    () => runBuildApkgPass(config, options.csvPath),
    (result) =>
      `Built ${result.cardCount} cards from ${options.csvPath} into ${options.outputPath}`,
  );

  console.log(
    `[pipeline] Completed deck pipeline in ${formatDuration(Date.now() - pipelineStartedAt)}`,
  );
}
