import { searchSentences } from "./tatoeba/tatoebaSentences";

const getSentencesForWord = async (word: string) => {
  const result = (
    await searchSentences(
      {
        lang: "eng",
        "trans:lang": "swe",
        sort: "relevance",
        q: word,
        word_count: "4-40",
        limit: 10,
      },
      {},
    )
  ).data.map((i) => {
    return {
      text: i.text,
      translation: i.translations!.map((it) => {
        return it.text;
      }),
    };
  });
  return result;
};

console.log(await getSentencesForWord("must"));
