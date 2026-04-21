import { searchSentences } from "./sentences/sentences";
import { default as Anki } from "anki-apkg-export";
import questionFormat from "./app/dist/index.html" with { type: "text" };

const questionFormatHtml = questionFormat as unknown as string;

type CardData = {
  sentence: string;
  translation: string;
  keyword: string;
  sentenceId: string;
  wordByWord: string;
};

const ARGOS_TRANSLATE_URL =
  Bun.env.ARGOS_TRANSLATE_URL ?? "http://127.0.0.1:8000/translate";
const wordTranslationCache = new Map<string, Promise<string>>();

const translateWord = async (word: string): Promise<string> => {
  const normalizedWord = word.trim();

  if (normalizedWord.length === 0) {
    return "";
  }

  const cacheKey = normalizedWord.toLowerCase();
  const cached = wordTranslationCache.get(cacheKey);
  if (cached) {
    return await cached;
  }

  const requestPromise = (async () => {
    try {
      const response = await fetch(ARGOS_TRANSLATE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: normalizedWord,
          source: "en",
          target: "hu",
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Argos request failed (${response.status}): ${errorBody}`,
        );
      }

      const data = (await response.json()) as { translatedText?: string };
      return data.translatedText ?? normalizedWord;
    } catch (error) {
      console.warn(
        `Falling back to original word for '${normalizedWord}':`,
        error,
      );
      return normalizedWord;
    }
  })();

  wordTranslationCache.set(cacheKey, requestPromise);
  return await requestPromise;
};

const generateWordByWord = async (sentence: string): Promise<string> => {
  const words =
    sentence.trim().length === 0 ? [] : sentence.trim().split(/\s+/);
  const translatedWords = await Promise.all(
    words.map((word) => translateWord(word)),
  );
  return JSON.stringify(translatedWords);
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

  return await Promise.all(
    response.data.map(async (sentence) => {
      const translations = sentence.translations ?? [];
      const translation = translations[0]?.text ?? "(no translation)";
      const wordByWord = await generateWordByWord(sentence.text);

      return {
        sentence: sentence.text,
        translation,
        keyword: word,
        sentenceId: String(sentence.id),
        wordByWord,
      };
    }),
  );
};

const main = async () => {
  const deck = new Anki("EN-HU sentence deck", {
    fields: [
      "Sentence",
      "SentenceTranslation",
      "Keyword",
      "SentenceId",
      "wordByWord",
    ],
    questionFormat: `
    <div id="front">{{Sentence}}</div>
    <div id="wordByWord" hidden>{{wordByWord}}</div>
    ${questionFormatHtml}`,
    answerFormat: `{{FrontSide}}<hr id="answer">{{SentenceTranslation}}`,
    css: ``,
  });

  const word = "must";
  const cards = await getSentencesForWord(word);

  for (const card of cards) {
    deck.addCard(
      card.sentence,
      card.translation,
      card.keyword,
      card.sentenceId,
      card.wordByWord,
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
