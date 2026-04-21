import {
  DEFAULT_SENTENCE_SEARCH_SORT,
  searchSentences,
} from "../sentenceRetrieval/index";
import { buildWordByWord } from "./translate";
import type { CardData, DeckBuildConfig, TranslateWord } from "./types";

export async function getCardsForWord(
  config: DeckBuildConfig,
  translateWord: TranslateWord,
): Promise<CardData[]> {
  const response = await searchSentences({
    lang: config.sentenceLanguage,
    "trans:lang": config.translationLanguage,
    sort: DEFAULT_SENTENCE_SEARCH_SORT,
    q: config.word,
    word_count: config.sentenceWordCount,
    limit: config.sentenceLimit,
  });

  return Promise.all(
    response.data.map(async (sentence) => {
      const translation =
        sentence.translations?.[0]?.text ?? "(no translation)";
      const wordByWord = await buildWordByWord(sentence.text, translateWord);

      return {
        sentence: sentence.text,
        translation,
        keyword: config.word,
        sentenceId: String(sentence.id),
        wordByWord,
      };
    }),
  );
}
