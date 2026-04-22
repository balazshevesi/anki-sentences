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
  type CardData,
} from "./modules/deck/index";

function escapeSqliteStringLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

function neutralizeAnkiMustacheInBundle(value: string): string {
  return value.replaceAll("{{", "{ {");
}

function escapeCsvField(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function getDeckFieldValues(card: CardData): [string, string, string, string, string] {
  return [
    card.sentence,
    card.translation,
    card.keyword,
    card.sentenceId,
    card.wordByWord,
  ];
}

function createDeckCsv(cards: CardData[]): string {
  const header = DECK_NOTE_FIELDS.join(",");
  const rows = cards.map((card) =>
    getDeckFieldValues(card).map(escapeCsvField).join(","),
  );

  return [header, ...rows].join("\n");
}

function getCsvOutputPath(outputPath: string): string {
  if (/\.apkg$/i.test(outputPath)) {
    return outputPath.replace(/\.apkg$/i, ".csv");
  }

  return `${outputPath}.csv`;
}

const main = async () => {
  // Load config + html
  const config = loadDeckBuildConfig();
  const questionFormatHtml = neutralizeAnkiMustacheInBundle(
    await loadQuestionFormatHtml(),
  );

  const questionFormat = `
    <div id="front">{{Sentence}}</div>
    <div id="wordByWord" hidden>{{wordByWord}}</div>
    ${questionFormatHtml}`;

  const answerFormat = `{{FrontSide}}<hr id="answer">{{SentenceTranslation}}`;

  // Create new anki deck
  const deck = new Anki(config.deckName, {
    fields: [...DECK_NOTE_FIELDS],
    questionFormat: escapeSqliteStringLiteral(questionFormat),
    answerFormat: escapeSqliteStringLiteral(answerFormat),
    css: ``,
  });

  // Create word translator
  const translateWord = createWordTranslator({
    endpoint: config.argosTranslateUrl,
    sourceLanguage: config.argosSourceLanguage,
    targetLanguage: config.argosTargetLanguage,
  });

  // Get cards (based on config)
  const cards = await getCardsForWord(config, translateWord);

  // Add each card to the deck
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

  // Write the deck to storage
  await mkdir(dirname(config.outputPath), { recursive: true });
  const apkgBlob = await deck.save();
  await Bun.write(config.outputPath, apkgBlob);
  const csvOutputPath = getCsvOutputPath(config.outputPath);
  const csvContent = createDeckCsv(cards);
  await Bun.write(csvOutputPath, csvContent);
  console.log(
    `Saved ${cards.length} cards for '${config.word}' to ${config.outputPath} and ${csvOutputPath}`,
  );
};

try {
  await main();
} catch (error) {
  console.error("Deck generation failed:", error);
  process.exit(1);
}
