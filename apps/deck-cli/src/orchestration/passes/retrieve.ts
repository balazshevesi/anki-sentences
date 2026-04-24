import type { PipelineCsvRow } from "../../deck/csv";
import { writePipelineCsvRows } from "../../deck/csv";
import type { DeckBuildConfig, DeckRuntimeConfig } from "../../deck/types";
import {
  fetchSentenceJobsForWords,
  formatSentenceTranslation,
  getSentenceTranslations,
} from "../../deck/cards";
import { EMPTY_CARD_PAYLOAD_JSON } from "../../contracts/cardPayload";

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
    audio: "",
  }));

  await writePipelineCsvRows(csvPath, rows);
  return rows;
}
