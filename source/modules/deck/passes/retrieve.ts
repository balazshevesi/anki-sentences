import {
  fetchSentenceJobsForWords,
  formatSentenceTranslation,
  getSentenceTranslations,
} from "../cards";
import type { PipelineCsvRow } from "../csv";
import { writePipelineCsvRows } from "../csv";
import type { DeckBuildConfig, DeckRuntimeConfig } from "../types";
import { EMPTY_CARD_PAYLOAD_JSON } from "../../shared/cardPayload";

export async function runSentenceRetrievalPass(
  config: DeckBuildConfig,
  csvPath: string,
  runtime: DeckRuntimeConfig,
): Promise<PipelineCsvRow[]> {
  const sentenceJobs = await fetchSentenceJobsForWords(config, {
    wordRetrievalConcurrency: runtime.wordRetrievalConcurrency,
  });

  const rows: PipelineCsvRow[] = sentenceJobs.map((job) => ({
    Sentence: job.sentence.text,
    SentenceTranslation: formatSentenceTranslation(
      getSentenceTranslations(job.sentence, config.sentenceTranslationLimit),
    ),
    Keyword: job.word,
    SentenceId: String(job.sentence.id),
    cardPayload: EMPTY_CARD_PAYLOAD_JSON,
    difficulty: "",
  }));

  await writePipelineCsvRows(csvPath, rows);
  return rows;
}
