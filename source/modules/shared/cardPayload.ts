import { parseAudioMetadata, type AudioMetadata } from "./audioMetadata";

export type WordRarity =
  | "very_common"
  | "common"
  | "uncommon"
  | "rare"
  | "very_rare";

export type WordFrequencyInfo = {
  rank: number | null;
  occurrencePercentage: number | null;
  rarity: WordRarity;
  hint: string;
};

export type WordTranslation = {
  translatedText: string;
  alternatives: string[];
  frequency: WordFrequencyInfo;
};

export type NgramTranslation = {
  phrase: string;
  ngramLength: number;
  translatedText: string;
  alternatives: string[];
  occurrenceCount: number;
  cardCount: number;
  cardPercentage: number;
};

export type CardPayload = {
  wordByWord: Record<string, WordTranslation>;
  ngramTranslations: NgramTranslation[];
  audioMetadata: AudioMetadata | null;
};

const WORD_RARITIES = new Set<WordRarity>([
  "very_common",
  "common",
  "uncommon",
  "rare",
  "very_rare",
]);

export const EMPTY_WORD_FREQUENCY: WordFrequencyInfo = {
  rank: null,
  occurrencePercentage: null,
  rarity: "very_rare",
  hint: "",
};

export const EMPTY_WORD_TRANSLATION: WordTranslation = {
  translatedText: "",
  alternatives: [],
  frequency: EMPTY_WORD_FREQUENCY,
};

export const EMPTY_CARD_PAYLOAD: CardPayload = {
  wordByWord: {},
  ngramTranslations: [],
  audioMetadata: null,
};

export const EMPTY_CARD_PAYLOAD_JSON = JSON.stringify(EMPTY_CARD_PAYLOAD);

export function isWordRarity(value: string): value is WordRarity {
  return WORD_RARITIES.has(value as WordRarity);
}

export function parseWordTranslation(value: unknown): WordTranslation {
  if (typeof value === "string") {
    return {
      translatedText: value,
      alternatives: [],
      frequency: EMPTY_WORD_FREQUENCY,
    };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return EMPTY_WORD_TRANSLATION;
  }

  const wordTranslation = value as {
    translatedText?: unknown;
    alternatives?: unknown;
    frequency?: unknown;
  };

  const rawFrequency = wordTranslation.frequency as
    | {
      rank?: unknown;
      occurrencePercentage?: unknown;
      rarity?: unknown;
      hint?: unknown;
    }
    | undefined;

  const rank =
    typeof rawFrequency?.rank === "number" && Number.isFinite(rawFrequency.rank)
      ? rawFrequency.rank
      : null;
  const occurrencePercentage =
    typeof rawFrequency?.occurrencePercentage === "number"
    && Number.isFinite(rawFrequency.occurrencePercentage)
      ? rawFrequency.occurrencePercentage
      : null;

  return {
    translatedText:
      typeof wordTranslation.translatedText === "string"
        ? wordTranslation.translatedText
        : "",
    alternatives: Array.isArray(wordTranslation.alternatives)
      ? wordTranslation.alternatives.map((alternative) => String(alternative))
      : [],
    frequency: {
      rank,
      occurrencePercentage,
      rarity:
        typeof rawFrequency?.rarity === "string"
        && isWordRarity(rawFrequency.rarity)
          ? rawFrequency.rarity
          : EMPTY_WORD_FREQUENCY.rarity,
      hint:
        typeof rawFrequency?.hint === "string"
          ? rawFrequency.hint
          : EMPTY_WORD_FREQUENCY.hint,
    },
  };
}

export function parseWordByWord(value: unknown): Record<string, WordTranslation> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([word, translation]) => [
      word,
      parseWordTranslation(translation),
    ]),
  );
}

export function parseWordByWordJson(raw: string): Record<string, WordTranslation> {
  try {
    return parseWordByWord(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

export function normalizeNgramTranslation(value: unknown): NgramTranslation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      phrase: "",
      ngramLength: 0,
      translatedText: "",
      alternatives: [],
      occurrenceCount: 0,
      cardCount: 0,
      cardPercentage: 0,
    };
  }

  const raw = value as Partial<NgramTranslation>;
  return {
    phrase: typeof raw.phrase === "string" ? raw.phrase : "",
    ngramLength:
      typeof raw.ngramLength === "number" && Number.isFinite(raw.ngramLength)
        ? raw.ngramLength
        : 0,
    translatedText:
      typeof raw.translatedText === "string" ? raw.translatedText : "",
    alternatives: Array.isArray(raw.alternatives)
      ? raw.alternatives.map((item) => String(item))
      : [],
    occurrenceCount:
      typeof raw.occurrenceCount === "number" && Number.isFinite(raw.occurrenceCount)
        ? raw.occurrenceCount
        : 0,
    cardCount:
      typeof raw.cardCount === "number" && Number.isFinite(raw.cardCount)
        ? raw.cardCount
        : 0,
    cardPercentage:
      typeof raw.cardPercentage === "number" && Number.isFinite(raw.cardPercentage)
        ? raw.cardPercentage
        : 0,
  };
}

export function parseNgramTranslations(value: unknown): NgramTranslation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeNgramTranslation(item))
    .filter((item) => item.phrase.length > 0 && item.translatedText.length > 0);
}

export function parseNgramTranslationsJson(raw: string): NgramTranslation[] {
  try {
    return parseNgramTranslations(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export function parseCardPayload(value: unknown): CardPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return EMPTY_CARD_PAYLOAD;
  }

  const rawPayload = value as {
    wordByWord?: unknown;
    ngramTranslations?: unknown;
    audioMetadata?: unknown;
  };

  return {
    wordByWord: parseWordByWord(rawPayload.wordByWord),
    ngramTranslations: parseNgramTranslations(rawPayload.ngramTranslations),
    audioMetadata: parseAudioMetadata(rawPayload.audioMetadata),
  };
}

export function parseCardPayloadJson(raw: string): CardPayload {
  try {
    return parseCardPayload(JSON.parse(raw) as unknown);
  } catch {
    return EMPTY_CARD_PAYLOAD;
  }
}
