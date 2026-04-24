import type { WordFrequencyInfo } from "../shared/cardPayload";

const LENGTH_WEIGHT = 0.6;
const RARITY_WEIGHT = 0.4;
const RARITY_MEAN_WEIGHT = 0.7;
const RARITY_P80_WEIGHT = 0.3;
const LENGTH_MIDPOINT_WORDS = 8;
const LENGTH_STEEPNESS = 3;
const DEFAULT_MAX_FREQUENCY_RANK = 50_000;

type FrequencyLookupFn = (word: string) => WordFrequencyInfo;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function percentile(values: number[], quantile: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 1) {
    return sorted[0] ?? 0;
  }

  const position = (sorted.length - 1) * clamp(quantile, 0, 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex] ?? 0;
  const upper = sorted[upperIndex] ?? lower;

  if (lowerIndex === upperIndex) {
    return lower;
  }

  const weight = position - lowerIndex;
  return lower + (upper - lower) * weight;
}

function scoreWordRarity(rank: number | null, maxRank: number): number {
  if (rank === null || !Number.isFinite(rank)) {
    return 1;
  }

  const sanitizedMaxRank = Math.max(2, Math.floor(maxRank));
  const sanitizedRank = clamp(Math.floor(rank), 1, sanitizedMaxRank);
  return Math.log(sanitizedRank) / Math.log(sanitizedMaxRank);
}

function tokenizeSentenceForDifficulty(sentence: string): string[] {
  if (sentence.trim().length === 0) {
    return [];
  }

  return sentence
    .trim()
    .split(/\s+/)
    .map((token) =>
      token
        .replace(/^[^\p{L}\p{N}'’]+|[^\p{L}\p{N}'’]+$/gu, "")
        .replaceAll("’", "'"),
    )
    .filter((token) => token.length > 0);
}

export function calculateSentenceDifficultyScore(
  sentence: string,
  getWordFrequencyInfo: FrequencyLookupFn,
  maxRank = DEFAULT_MAX_FREQUENCY_RANK,
): number {
  const tokens = tokenizeSentenceForDifficulty(sentence);
  const lengthScore = sigmoid((tokens.length - LENGTH_MIDPOINT_WORDS) / LENGTH_STEEPNESS);

  const rarityScores = tokens.map((token) => {
    const frequency = getWordFrequencyInfo(token);
    return scoreWordRarity(frequency.rank, maxRank);
  });

  const rarityMean =
    rarityScores.length === 0
      ? 0
      : rarityScores.reduce((sum, score) => sum + score, 0) / rarityScores.length;
  const rarityP80 = percentile(rarityScores, 0.8);
  const rarityScore = (RARITY_MEAN_WEIGHT * rarityMean) + (RARITY_P80_WEIGHT * rarityP80);

  const weightedScore =
    (LENGTH_WEIGHT * lengthScore) + (RARITY_WEIGHT * rarityScore);

  return Number((weightedScore * 100).toFixed(2));
}
