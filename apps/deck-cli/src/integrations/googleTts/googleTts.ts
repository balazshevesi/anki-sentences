import { createHash } from "node:crypto";
import {
  GOOGLE_TTS_PROVIDER,
  type AudioWordTimestamp,
  type ErrorAudioMetadata,
  type ReadyAudioMetadata,
} from "../../contracts/audioMetadata";
import { resolveGoogleAuthHeaders } from "./googleTtsAuth";
import { requestGoogleTtsSynthesis } from "./googleTtsHttp";
import { writeAudioBufferToOutputFile } from "./googleTtsStorage";
import { transcodeLinear16ToMp3 } from "./googleTtsTranscode";

const OUTPUT_AUDIO_EXTENSION = "mp3";
const WORD_MARK_PREFIX = "word_";

type GoogleTtsTimepoint = {
  markName?: unknown;
  timeSeconds?: unknown;
};

type AudioGenerationRow = {
  SentenceId: string;
  Sentence: string;
};

export type GoogleTtsConfig = {
  accessToken?: string;
  languageCode: string;
  voiceName?: string;
  speakingRate: number;
  pitch: number;
  audioOutputDir: string;
  quotaProject?: string;
};

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}


export function tokenizeSentenceForSpeech(sentence: string): string[] {
  return sentence
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

export function buildSsmlWithWordMarks(tokens: string[]): {
  ssml: string;
  markNames: string[];
} {
  const markNames = tokens.map((_, index) => `${WORD_MARK_PREFIX}${index}`);

  const markedSegments = tokens.map((token, index) => {
    const markName = `${WORD_MARK_PREFIX}${index}`;
    return `<mark name="${markName}"/>${escapeXml(token)}`;
  });

  return {
    ssml: `<speak>${markedSegments.join(" ")}</speak>`,
    markNames,
  };
}

function parseGoogleTimepoints(value: unknown): GoogleTtsTimepoint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is GoogleTtsTimepoint =>
      Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
  );
}

export function buildWordTimestamps(
  tokens: string[],
  markNames: string[],
  timepoints: GoogleTtsTimepoint[],
): AudioWordTimestamp[] {
  const startTimeByMark = new Map<string, number>();

  for (const timepoint of timepoints) {
    const markName = timepoint.markName;
    const timeSeconds = timepoint.timeSeconds;
    if (
      typeof markName === "string" &&
      typeof timeSeconds === "number" &&
      Number.isFinite(timeSeconds)
    ) {
      startTimeByMark.set(markName, Math.max(0, timeSeconds));
    }
  }

  return tokens.map((token, index) => {
    const currentMark = markNames[index];
    const nextMark = markNames[index + 1];

    const startSeconds = currentMark
      ? startTimeByMark.get(currentMark)
      : undefined;
    const endSeconds = nextMark ? startTimeByMark.get(nextMark) : undefined;

    const startMs =
      typeof startSeconds === "number"
        ? Math.round(startSeconds * 1_000)
        : null;
    const endMs =
      typeof endSeconds === "number" ? Math.round(endSeconds * 1_000) : null;

    return {
      index,
      token,
      startMs,
      endMs,
    };
  });
}

function sanitizeSentenceId(sentenceId: string): string {
  const trimmed = sentenceId.trim();
  if (trimmed.length === 0) {
    return "unknown";
  }

  return trimmed.replaceAll(/[^a-zA-Z0-9_-]/g, "_");
}

function buildAudioFileName(sentenceId: string, sentence: string): string {
  const sentenceHash = createHash("sha1")
    .update(sentence)
    .digest("hex")
    .slice(0, 10);
  return `tts-${sanitizeSentenceId(sentenceId)}-${sentenceHash}.${OUTPUT_AUDIO_EXTENSION}`;
}

async function synthesizeWithGoogleTextToSpeech(
  sentence: string,
  config: GoogleTtsConfig,
): Promise<{
  audioBuffer: Buffer;
  words: AudioWordTimestamp[];
}> {
  const tokens = tokenizeSentenceForSpeech(sentence);
  if (tokens.length === 0) {
    throw new Error("Cannot generate audio for an empty sentence.");
  }

  const { ssml, markNames } = buildSsmlWithWordMarks(tokens);

  const authHeaders = await resolveGoogleAuthHeaders(config);
  const synthesis = await requestGoogleTtsSynthesis({
    ssml,
    config: {
      languageCode: config.languageCode,
      voiceName: config.voiceName,
      speakingRate: config.speakingRate,
      pitch: config.pitch,
    },
    headers: authHeaders,
  });
  const mp3AudioBuffer = await transcodeLinear16ToMp3(
    synthesis.linear16AudioBuffer,
  );

  return {
    audioBuffer: mp3AudioBuffer,
    words: buildWordTimestamps(
      tokens,
      markNames,
      parseGoogleTimepoints(synthesis.timepoints),
    ),
  };
}

export function createGoogleTtsErrorMetadata(
  sentenceId: string,
  message: string,
): ErrorAudioMetadata {
  return {
    status: "error",
    provider: GOOGLE_TTS_PROVIDER,
    sentenceId,
    generatedAt: new Date().toISOString(),
    message,
  };
}

export async function generateGoogleTtsAudioMetadata(
  row: AudioGenerationRow,
  config: GoogleTtsConfig,
): Promise<ReadyAudioMetadata> {
  const audioFileName = buildAudioFileName(row.SentenceId, row.Sentence);

  const { audioBuffer, words } = await synthesizeWithGoogleTextToSpeech(
    row.Sentence,
    config,
  );

  await writeAudioBufferToOutputFile(
    config.audioOutputDir,
    audioFileName,
    audioBuffer,
  );

  return {
    status: "ready",
    provider: GOOGLE_TTS_PROVIDER,
    sentenceId: row.SentenceId,
    generatedAt: new Date().toISOString(),
    audioFileName,
    ankiSoundTag: `[sound:${audioFileName}]`,
    languageCode: config.languageCode,
    voiceName: config.voiceName ?? null,
    speakingRate: config.speakingRate,
    pitch: config.pitch,
    words,
  };
}
