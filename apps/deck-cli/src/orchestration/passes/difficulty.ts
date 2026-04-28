import type { PipelineCsvRow } from "../../deck/csv";
import { readPipelineCsvRows, writePipelineCsvRows } from "../../deck/csv";
import { calculateSentenceDifficultyScore } from "../../deck/difficulty";
import type { DeckBuildConfig } from "../../deck/types";
import type { IntegrationContext } from "../../integrations/createIntegrationContext";

export async function runDifficultyPass(
  config: DeckBuildConfig,
  csvPath: string,
  integrations: IntegrationContext,
): Promise<PipelineCsvRow[]> {
  const rows = await readPipelineCsvRows(csvPath);
  const frequencyLookup = await integrations.wordFrequency.getLookup(
    config.translationSourceLanguage,
  );
  if (!frequencyLookup.sourceFile) {
    console.warn(
      `No frequency list found for '${config.translationSourceLanguage}'. Falling back to default rarity hints.`,
    );
  }

  const enrichedRows = rows.map((row) => ({
    ...row,
    difficulty: calculateSentenceDifficultyScore(
      row.Sentence,
      frequencyLookup.getWordFrequency,
    ).toFixed(2),
  }));

  const sortedRows = [...enrichedRows].sort((left, right) => {
    const leftDifficulty = Number.parseFloat(left.difficulty);
    const rightDifficulty = Number.parseFloat(right.difficulty);
    const difficultyDelta =
      (Number.isFinite(leftDifficulty)
        ? leftDifficulty
        : Number.POSITIVE_INFINITY) -
      (Number.isFinite(rightDifficulty)
        ? rightDifficulty
        : Number.POSITIVE_INFINITY);

    if (difficultyDelta !== 0) {
      return difficultyDelta;
    }

    return left.Sentence.localeCompare(right.Sentence);
  });

  await writePipelineCsvRows(csvPath, sortedRows);
  return sortedRows;
}
