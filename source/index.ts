import { default as Anki } from "anki-apkg-export";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  createWordTranslator,
  DEFAULT_DECK_SORT_FIELD,
  DECK_NOTE_FIELDS,
  getCardsForWords,
  loadDeckBuildConfig,
  loadQuestionFormatHtml,
  type CardData,
} from "./modules/deck/index";
import { loadWordFrequencyLookup } from "./modules/wordFrequencies/index";

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
  const frequencyLookup = await loadWordFrequencyLookup(config.argosSourceLanguage);
  if (!frequencyLookup.sourceFile) {
    console.warn(
      `No frequency list found for '${config.argosSourceLanguage}'. Falling back to default rarity hints.`,
    );
  }

  const translateWord = createWordTranslator({
    endpoint: config.argosTranslateUrl,
    sourceLanguage: config.argosSourceLanguage,
    targetLanguage: config.argosTargetLanguage,
    alternatives: config.argosAlternatives,
    getWordFrequencyInfo: frequencyLookup.getWordFrequency,
  });

  // Get cards (based on config)
  const cards = await getCardsForWords(config, translateWord);

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
          `keyword_${card.keyword}`,
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
    `Saved ${cards.length} cards for words [${config.words.join(", ")}] to ${config.outputPath} and ${csvOutputPath}`,
  );
};

try {
  await main();
} catch (error) {
  console.error("Deck generation failed:", error);
  process.exit(1);
}
