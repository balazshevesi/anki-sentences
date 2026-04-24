export const GOOGLE_TTS_PROVIDER = "google_text_to_speech" as const;

export type AudioWordTimestamp = {
  index: number;
  token: string;
  startMs: number | null;
  endMs: number | null;
};

type BaseAudioMetadata = {
  provider: typeof GOOGLE_TTS_PROVIDER;
  sentenceId: string;
  generatedAt: string;
};

export type ReadyAudioMetadata = BaseAudioMetadata & {
  status: "ready";
  audioFileName: string;
  ankiSoundTag: string;
  languageCode: string;
  voiceName: string | null;
  speakingRate: number;
  pitch: number;
  words: AudioWordTimestamp[];
};

export type ErrorAudioMetadata = BaseAudioMetadata & {
  status: "error";
  message: string;
};

export type AudioMetadata = ReadyAudioMetadata | ErrorAudioMetadata;

type AudioMetadataRecord = Record<string, unknown>;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseTimestampEntry(value: unknown): AudioWordTimestamp | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const entry = value as AudioMetadataRecord;
  const index = entry.index;
  const token = entry.token;
  const startMs = entry.startMs;
  const endMs = entry.endMs;

  if (
    typeof index !== "number" ||
    !Number.isSafeInteger(index) ||
    index < 0 ||
    typeof token !== "string"
  ) {
    return null;
  }

  const parsedStart = isFiniteNumber(startMs) ? Math.max(0, Math.round(startMs)) : null;
  const parsedEnd = isFiniteNumber(endMs) ? Math.max(0, Math.round(endMs)) : null;

  return {
    index,
    token,
    startMs: parsedStart,
    endMs: parsedEnd,
  };
}

export function parseAudioMetadata(value: unknown): AudioMetadata | null {
  if (Array.isArray(value) && value.length === 0) {
    return null;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const metadata = value as AudioMetadataRecord;
  const status = metadata.status;
  const provider = metadata.provider;
  const sentenceId = metadata.sentenceId;
  const generatedAt = metadata.generatedAt;

  if (
    (status !== "ready" && status !== "error") ||
    provider !== GOOGLE_TTS_PROVIDER ||
    typeof sentenceId !== "string" ||
    typeof generatedAt !== "string"
  ) {
    return null;
  }

  if (status === "error") {
    const message = metadata.message;
    if (typeof message !== "string") {
      return null;
    }

    return {
      status,
      provider,
      sentenceId,
      generatedAt,
      message,
    };
  }

  const audioFileName = metadata.audioFileName;
  const ankiSoundTag = metadata.ankiSoundTag;
  const languageCode = metadata.languageCode;
  const voiceName = metadata.voiceName;
  const speakingRate = metadata.speakingRate;
  const pitch = metadata.pitch;
  const words = metadata.words;

  if (
    typeof audioFileName !== "string" ||
    typeof ankiSoundTag !== "string" ||
    typeof languageCode !== "string" ||
    (voiceName !== null && typeof voiceName !== "string") ||
    !isFiniteNumber(speakingRate) ||
    !isFiniteNumber(pitch) ||
    !Array.isArray(words)
  ) {
    return null;
  }

  const parsedWords = words
    .map((entry) => parseTimestampEntry(entry))
    .filter((entry): entry is AudioWordTimestamp => entry !== null);

  return {
    status,
    provider,
    sentenceId,
    generatedAt,
    audioFileName,
    ankiSoundTag,
    languageCode,
    voiceName,
    speakingRate,
    pitch,
    words: parsedWords,
  };
}

export function isReadyAudioMetadata(
  metadata: AudioMetadata | null,
): metadata is ReadyAudioMetadata {
  return metadata?.status === "ready";
}
