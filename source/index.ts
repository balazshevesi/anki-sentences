import { default as Anki } from "anki-apkg-export";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  createWordTranslator,
  DEFAULT_DECK_SORT_FIELD,
  DECK_NOTE_FIELDS,
  getCardsForWord,
  loadDeckBuildConfig,
  loadQuestionFormatHtml,
} from "./modules/deck/index";

const main = async () => {
  const config = loadDeckBuildConfig();
  const questionFormatHtml = await loadQuestionFormatHtml();

  const deck = new Anki(config.deckName, {
    fields: [...DECK_NOTE_FIELDS],
    questionFormat: `
    <div id="front">{{Sentence}}</div>
    <div id="wordByWord" hidden>{{wordByWord}}</div>
    ${questionFormatHtml}`,
    answerFormat: `{{FrontSide}}<hr id="answer">{{SentenceTranslation}}`,
    css: ``,
  });

  const translateWord = createWordTranslator({
    endpoint: config.argosTranslateUrl,
    sourceLanguage: config.argosSourceLanguage,
    targetLanguage: config.argosTargetLanguage,
  });

  const cards = await getCardsForWord(config, translateWord);

  for (const card of cards) {
    deck.addCard(
      card.sentence,
      card.translation,
      card.keyword,
      card.sentenceId,
      card.wordByWord,
      {
        sortField: DEFAULT_DECK_SORT_FIELD,
        tags: [
          `sentence_lang_${config.sentenceLanguage}`,
          `translation_lang_${config.translationLanguage}`,
          `keyword_${config.word}`,
        ],
      },
    );
  }

  await mkdir(dirname(config.outputPath), { recursive: true });
  const apkgBlob = await deck.save();
  await Bun.write(config.outputPath, apkgBlob);
  console.log(
    `Saved ${cards.length} cards for '${config.word}' to ${config.outputPath}`,
  );
};

try {
  await main();
} catch (error) {
  console.error("Deck generation failed:", error);
  process.exit(1);
}
