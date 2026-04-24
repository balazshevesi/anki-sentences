import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import promiseLimit from "promise-limit";
import type { PipelineCsvRow } from "../csv";
import { readPipelineCsvRows, writePipelineCsvRows } from "../csv";
import type { DeckBuildConfig, DeckRuntimeConfig } from "../types";
import {
  createGoogleTtsErrorMetadata,
  generateGoogleTtsAudioMetadata,
  type GoogleTtsConfig,
} from "../../audioGeneration/googleTts";
import { resolveGoogleTtsLanguageCode } from "../../audioGeneration/googleTtsLanguage";
import { parseCardPayloadJson } from "../../shared/cardPayload";
import { isReadyAudioMetadata } from "../../shared/audioMetadata";
import { formatDuration } from "../../shared/formatDuration";

type PromiseLimitFn = <T>(fn: () => Promise<T>) => Promise<T>;

function progressInterval(totalRows: number): number {
  return totalRows <= 10 ? 1 : Math.max(1, Math.ceil(totalRows / 10));
}

function logProgress(
  label: string,
  completedRows: number,
  totalRows: number,
  startedAtMs: number,
): void {
  const elapsedMs = Date.now() - startedAtMs;
  const percentage = ((completedRows / totalRows) * 100).toFixed(1);
  const elapsedSeconds = elapsedMs / 1_000;
  const rowsPerSecond = elapsedSeconds > 0 ? completedRows / elapsedSeconds : 0;
  const remainingRows = totalRows - completedRows;
  const etaMs = rowsPerSecond > 0 ? (remainingRows / rowsPerSecond) * 1_000 : 0;
  const etaText =
    remainingRows > 0 ? `, ETA ${formatDuration(Math.round(etaMs))}` : "";

  console.log(
    `[${label}] Progress ${completedRows}/${totalRows} (${percentage}%) after ${formatDuration(elapsedMs)}${etaText}`,
  );
}

export async function runAudioMetadataPass(
  config: DeckBuildConfig,
  csvPath: string,
  runtime: DeckRuntimeConfig,
): Promise<PipelineCsvRow[]> {
  const rows = await readPipelineCsvRows(csvPath);
  if (rows.length === 0) {
    console.log(`[audio] No rows found in ${csvPath}; skipping enrichment.`);
    return rows;
  }

  const languageCode =
    config.googleTtsLanguageCode ??
    resolveGoogleTtsLanguageCode(config.sentenceLanguage);
  if (!languageCode) {
    throw new Error(
      `Missing Google Text-to-Speech language code for sentence language '${config.sentenceLanguage}'. Set audio.languageCode in deck.config.jsonc or GOOGLE_TTS_LANGUAGE_CODE.`,
    );
  }

  const googleTtsConfig: GoogleTtsConfig = {
    accessToken: config.googleTtsAccessToken,
    languageCode,
    voiceName: config.googleTtsVoiceName,
    speakingRate: config.googleTtsSpeakingRate,
    pitch: config.googleTtsPitch,
    audioOutputDir: config.audioOutputDir,
    quotaProject: config.googleCloudQuotaProject,
  };
  await mkdir(googleTtsConfig.audioOutputDir, { recursive: true });

  console.log(
    `[audio] Generating Google TTS audio for ${rows.length} rows (language: ${googleTtsConfig.languageCode}, concurrency: ${runtime.audioMetadataConcurrency}).`,
  );

  const sentenceLimit = promiseLimit(runtime.audioMetadataConcurrency) as PromiseLimitFn;
  const updateEvery = progressInterval(rows.length);
  const startedAt = Date.now();
  let completed = 0;
  let reusedRows = 0;
  let generatedRows = 0;
  let failedRows = 0;

  const enrichedRows = await Promise.all(
    rows.map((row) =>
      sentenceLimit(async () => {
        const existingCardPayload = parseCardPayloadJson(row.cardPayload);
        const existingMetadata = existingCardPayload.audioMetadata;
        const existingAudioFilePath = isReadyAudioMetadata(existingMetadata)
          ? join(googleTtsConfig.audioOutputDir, existingMetadata.audioFileName)
          : null;
        const hasExistingAudioFile = existingAudioFilePath
          ? await Bun.file(existingAudioFilePath).exists()
          : false;

        let nextAudioMetadata = existingMetadata;
        const shouldRegenerate =
          config.audioForceRegenerate ||
          !isReadyAudioMetadata(existingMetadata) ||
          existingMetadata.languageCode !== googleTtsConfig.languageCode ||
          existingMetadata.voiceName !== (googleTtsConfig.voiceName ?? null) ||
          existingMetadata.speakingRate !== googleTtsConfig.speakingRate ||
          existingMetadata.pitch !== googleTtsConfig.pitch ||
          !hasExistingAudioFile;

        if (!shouldRegenerate && existingMetadata) {
          reusedRows += 1;
          nextAudioMetadata = existingMetadata;
        } else {
          try {
            nextAudioMetadata = await generateGoogleTtsAudioMetadata(
              row,
              googleTtsConfig,
            );
            generatedRows += 1;
          } catch (error) {
            failedRows += 1;
            nextAudioMetadata = createGoogleTtsErrorMetadata(
              row.SentenceId,
              error instanceof Error ? error.message : `Unknown error: ${String(error)}`,
            );
          }
        }

        completed += 1;
        if (completed === 1 || completed === rows.length || completed % updateEvery === 0) {
          logProgress("audio", completed, rows.length, startedAt);
        }

        return {
          ...row,
          cardPayload: JSON.stringify({
            ...existingCardPayload,
            audioMetadata: nextAudioMetadata,
          }),
        };
      }),
    ),
  );

  await writePipelineCsvRows(csvPath, enrichedRows);
  console.log(
    `[audio] Generated ${generatedRows} row(s), reused ${reusedRows} row(s), failed ${failedRows} row(s).`,
  );
  return enrichedRows;
}
