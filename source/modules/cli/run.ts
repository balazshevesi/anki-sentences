import {
  runAudioMetadataPass,
  runBuildApkgPass,
  runDifficultyPass,
  runSentenceRetrievalPass,
  runTranslationMetadataPass,
} from "../deck/passes";
import type { DeckBuildConfig } from "../deck/types";
import type { CliOptions, PipelineCommand } from "./types";

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
    const rows = await runSentenceRetrievalPass(config, options.csvPath);
    console.log(`Retrieved ${rows.length} sentence rows into ${options.csvPath}`);
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
    console.log(`Added audio metadata placeholders to ${rows.length} rows in ${options.csvPath}`);
    return;
  }

  if (command === "enrich-difficulty") {
    const rows = await runDifficultyPass(config, options.csvPath);
    console.log(
      `Calculated difficulty scores and sorted ${rows.length} rows in ${options.csvPath}`,
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

  const retrievedRows = await runSentenceRetrievalPass(config, options.csvPath);
  console.log(`Retrieved ${retrievedRows.length} sentence rows into ${options.csvPath}`);

  const translatedRows = await runTranslationMetadataPass(config, options.csvPath);
  console.log(
    `Added word and n-gram translation metadata to ${translatedRows.length} rows in ${options.csvPath}`,
  );

  const difficultyRows = await runDifficultyPass(config, options.csvPath);
  console.log(
    `Calculated difficulty scores and sorted ${difficultyRows.length} rows in ${options.csvPath}`,
  );

  if (!options.skipAudio) {
    const audioRows = await runAudioMetadataPass(options.csvPath);
    console.log(`Added audio metadata placeholders to ${audioRows.length} rows in ${options.csvPath}`);
  }

  const buildResult = await runBuildApkgPass(config, options.csvPath);
  console.log(
    `Built ${buildResult.cardCount} cards from ${options.csvPath} into ${options.outputPath}`,
  );
}
