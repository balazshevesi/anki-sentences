import type { PipelineCsvRow } from "../../deck/csv";
import { writePipelineCsvRows } from "../../deck/csv";
import type { DeckBuildConfig, DeckRuntimeConfig } from "../../deck/types";
import type { IntegrationContext } from "../../integrations/createIntegrationContext";
import type { WordFrequencyPort } from "../../integrations/ports/index";
import {
  fetchSentenceJobsForWords,
  formatSentenceTranslation,
  getSentenceTranslations,
} from "../../deck/cards";
import { EMPTY_CARD_PAYLOAD_JSON } from "../../contracts/cardPayload";

export async function getSentenceRetrievalWords(
  config: DeckBuildConfig,
  wordFrequency: WordFrequencyPort,
): Promise<string[]> {
  const explicitWords = config.words
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
  let commonWords: string[] = [];

  if (config.commonWordLimit > 0) {
    const frequencyLookup = await wordFrequency.getLookup(
      config.translationSourceLanguage,
    );
    if (!frequencyLookup.sourceFile) {
      console.warn(
        `No frequency list found for '${config.translationSourceLanguage}'. Skipping common-word retrieval.`,
      );
    }

    commonWords = frequencyLookup.getMostCommonWords(config.commonWordLimit);
  }

  const words = Array.from(new Set([...explicitWords, ...commonWords]));

  if (words.length === 0) {
    throw new Error(
      "No sentence retrieval words available. Add deck.words or configure deck.commonWordLimit with an available frequency list.",
    );
  }

  return words;
}

export async function runSentenceRetrievalPass(
  config: DeckBuildConfig,
  csvPath: string,
  runtime: DeckRuntimeConfig,
  integrations: IntegrationContext,
): Promise<PipelineCsvRow[]> {
  const words = await getSentenceRetrievalWords(
    config,
    integrations.wordFrequency,
  );
  const sentenceJobs = await fetchSentenceJobsForWords(
    {
      ...config,
      words,
    },
    {
      sentenceSource: integrations.sentenceSource,
      wordRetrievalConcurrency: runtime.wordRetrievalConcurrency,
    },
  );

  const rows: PipelineCsvRow[] = sentenceJobs.map((job) => ({
    Sentence: job.sentence.text,
    SentenceTranslation: formatSentenceTranslation(
      getSentenceTranslations(job.sentence, config.sentenceTranslationLimit),
    ),
    Keyword: job.word,
    SentenceId: job.sentence.id,
    cardPayload: EMPTY_CARD_PAYLOAD_JSON,
    difficulty: "",
    audio: "",
  }));

  await writePipelineCsvRows(csvPath, rows);
  return rows;
}
