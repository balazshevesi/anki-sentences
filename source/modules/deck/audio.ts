import { createHash } from "node:crypto";
import { join } from "node:path";
import { GoogleAuth } from "google-auth-library";
import type { PipelineCsvRow } from "./csv";
import {
  GOOGLE_TTS_PROVIDER,
  type AudioWordTimestamp,
  type ErrorAudioMetadata,
  type ReadyAudioMetadata,
} from "../shared/audioMetadata";

const GOOGLE_TTS_SYNTHESIZE_URL =
  "https://texttospeech.googleapis.com/v1beta1/text:synthesize";
const GOOGLE_CLOUD_PLATFORM_SCOPE =
  "https://www.googleapis.com/auth/cloud-platform";
const WORD_MARK_PREFIX = "word_";
const googleAuth = new GoogleAuth({ scopes: [GOOGLE_CLOUD_PLATFORM_SCOPE] });

type GoogleTtsTimepoint = {
  markName?: unknown;
  timeSeconds?: unknown;
};

type GoogleTtsApiResponse = {
  audioContent?: unknown;
  timepoints?: unknown;
  error?: {
    message?: unknown;
  };
};

export type GoogleTtsConfig = {
  accessToken?: string;
  languageCode: string;
  voiceName?: string;
  speakingRate: number;
  pitch: number;
  audioOutputDir: string;
};

function toAuthResolutionError(message: string): Error {
  return new Error(
    [
      message,
      "Google Text-to-Speech requires OAuth2 credentials (API keys are not supported).",
      "Use one of these approaches:",
      "- Preferred local setup: `gcloud auth application-default login`",
      "- Service account setup: set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON key file",
      "- Manual token setup: set GOOGLE_TTS_ACCESS_TOKEN or pass --google-tts-access-token",
    ].join("\n"),
  );
}

function readQuotaProjectOverride(): string | undefined {
  const fromEnv = Bun.env.GOOGLE_CLOUD_QUOTA_PROJECT?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }

  return undefined;
}

async function resolveGoogleAuthHeaders(config: GoogleTtsConfig): Promise<Headers> {
  const headers = new Headers();

  const configuredToken = config.accessToken?.trim();
  if (configuredToken) {
    headers.set("authorization", `Bearer ${configuredToken}`);
  } else {
    try {
      const client = await googleAuth.getClient();
      const authHeaders = await client.getRequestHeaders(GOOGLE_TTS_SYNTHESIZE_URL);
      for (const [name, value] of authHeaders.entries()) {
        headers.set(name, value);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw toAuthResolutionError(
        `Failed to resolve Google OAuth2 credentials: ${reason}`,
      );
    }
  }

  const quotaProjectOverride = readQuotaProjectOverride();
  if (quotaProjectOverride && !headers.has("x-goog-user-project")) {
    headers.set("x-goog-user-project", quotaProjectOverride);
  }

  return headers;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function toGoogleApiErrorMessage(
  statusCode: number,
  payload: GoogleTtsApiResponse | null,
  responseBody: string,
): string {
  const apiErrorMessage = payload?.error?.message;
  if (typeof apiErrorMessage === "string" && apiErrorMessage.trim().length > 0) {
    return `Google Text-to-Speech API request failed (${statusCode}): ${apiErrorMessage}`;
  }

  const body = responseBody.trim();
  if (body.length > 0) {
    return `Google Text-to-Speech API request failed (${statusCode}): ${body}`;
  }

  return `Google Text-to-Speech API request failed with status ${statusCode}.`;
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

    const startSeconds = currentMark ? startTimeByMark.get(currentMark) : undefined;
    const endSeconds = nextMark ? startTimeByMark.get(nextMark) : undefined;

    const startMs =
      typeof startSeconds === "number" ? Math.round(startSeconds * 1_000) : null;
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

export function buildAudioFileName(sentenceId: string, sentence: string): string {
  const sentenceHash = createHash("sha1").update(sentence).digest("hex").slice(0, 10);
  return `tts-${sanitizeSentenceId(sentenceId)}-${sentenceHash}.mp3`;
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

  const voice: { languageCode: string; name?: string } = {
    languageCode: config.languageCode,
  };
  if (config.voiceName && config.voiceName.trim().length > 0) {
    voice.name = config.voiceName;
  }

  const authHeaders = await resolveGoogleAuthHeaders(config);
  authHeaders.set("content-type", "application/json");

  const response = await fetch(
    GOOGLE_TTS_SYNTHESIZE_URL,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        input: {
          ssml,
        },
        voice,
        audioConfig: {
          audioEncoding: "MP3",
          speakingRate: config.speakingRate,
          pitch: config.pitch,
        },
        enableTimePointing: ["SSML_MARK"],
      }),
      signal: AbortSignal.timeout(60_000),
    },
  );

  const responseBody = await response.text();
  let payload: GoogleTtsApiResponse | null = null;
  if (responseBody.trim().length > 0) {
    try {
      payload = JSON.parse(responseBody) as GoogleTtsApiResponse;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw new Error(
      toGoogleApiErrorMessage(response.status, payload, responseBody),
    );
  }

  const audioContent = payload?.audioContent;
  if (typeof audioContent !== "string" || audioContent.length === 0) {
    throw new Error("Google Text-to-Speech API returned no audio content.");
  }

  return {
    audioBuffer: Buffer.from(audioContent, "base64"),
    words: buildWordTimestamps(tokens, markNames, parseGoogleTimepoints(payload?.timepoints)),
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
  row: PipelineCsvRow,
  config: GoogleTtsConfig,
): Promise<ReadyAudioMetadata> {
  const audioFileName = buildAudioFileName(row.SentenceId, row.Sentence);
  const outputFilePath = join(config.audioOutputDir, audioFileName);

  const { audioBuffer, words } = await synthesizeWithGoogleTextToSpeech(
    row.Sentence,
    config,
  );

  await Bun.write(outputFilePath, audioBuffer);

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
