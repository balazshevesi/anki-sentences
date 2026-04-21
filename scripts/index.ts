import { searchSentences } from "./sentences/sentences";
import { default as Anki } from "anki-apkg-export";

const deck = new Anki("EN-HU sentence deck", {
  fields: ["Sentence", "Translation", "Keyword", "SentenceId"],
  questionFormat: `<div id="front" class="card">{{Sentence}}</div>`,
  answerFormat: `{{FrontSide}}<hr id="answer">{{Translation}}`,
});

type CardData = {
  sentence: string;
  translation: string;
  keyword: string;
  sentenceId: string;
};

const getSentencesForWord = async (word: string): Promise<CardData[]> => {
  const response = await searchSentences({
    lang: "eng",
    "trans:lang": "hun",
    sort: "relevance",
    q: word,
    word_count: "4-40",
    limit: 10,
  });

  return response.data.map((sentence) => {
    const translations = sentence.translations ?? [];
    const translation = translations[0]?.text ?? "(no translation)";

    return {
      sentence: sentence.text,
      translation,
      keyword: word,
      sentenceId: String(sentence.id),
    };
  });
};

const main = async () => {
  const word = "must";
  const cards = await getSentencesForWord(word);

  for (const card of cards) {
    deck.addCard(
      card.sentence,
      card.translation,
      card.keyword,
      card.sentenceId,
      {
        sortField: 0,
        tags: ["english", "hungarian", `keyword_${word}`],
      },
    );
  }

  const apkgBlob = await deck.save();
  await Bun.write("example.apkg", apkgBlob);
  console.log(`Saved ${cards.length} cards to example.apkg`);
};

await main();
