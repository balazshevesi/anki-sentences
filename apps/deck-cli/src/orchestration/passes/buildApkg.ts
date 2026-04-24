import { default as Anki } from "anki-apkg-export";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { loadQuestionTemplateBundle } from "../../deck/template";
import { DECK_NOTE_FIELDS, readPipelineCsvRows } from "../../deck/csv";
import type { DeckBuildConfig, DeckRuntimeConfig } from "../../deck/types";
import { parseCardPayloadJson } from "../../contracts/cardPayload";
import { isReadyAudioMetadata } from "../../contracts/audioMetadata";

function escapeSqliteStringLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

function neutralizeAnkiMustacheInBundle(value: string): string {
  return value.replaceAll("{{", "{ {");
}

export async function runBuildApkgPass(
  config: DeckBuildConfig,
  csvPath: string,
  runtime: DeckRuntimeConfig,
): Promise<{ cardCount: number }> {
  const rows = await readPipelineCsvRows(csvPath);
  const templateBundle = await loadQuestionTemplateBundle();
  const questionFormatHtml = neutralizeAnkiMustacheInBundle(
    templateBundle.html,
  );

  const questionFormat = `
    <div id="front" class="card-template-loading">{{Sentence}}</div>
    <div id="cardPayload" hidden>{{cardPayload}}</div>
    ${questionFormatHtml}`;
  const answerFormat = '{{FrontSide}}<hr id="answer">{{SentenceTranslation}}';

  const deck = new Anki(config.deckName, {
    fields: [...DECK_NOTE_FIELDS],
    questionFormat: escapeSqliteStringLiteral(questionFormat),
    answerFormat: escapeSqliteStringLiteral(answerFormat),
    css: escapeSqliteStringLiteral(templateBundle.css),
  });

  const includedMediaFiles = new Set<string>();

  for (const row of rows) {
    const parsedAudioMetadata = parseCardPayloadJson(
      row.cardPayload,
    ).audioMetadata;
    const audioFieldValue =
      row.audio.trim().length > 0
        ? row.audio
        : isReadyAudioMetadata(parsedAudioMetadata)
          ? parsedAudioMetadata.ankiSoundTag
          : "";
    if (isReadyAudioMetadata(parsedAudioMetadata)) {
      const mediaFileName = parsedAudioMetadata.audioFileName;
      if (!includedMediaFiles.has(mediaFileName)) {
        const mediaFilePath = join(config.audioOutputDir, mediaFileName);
        const mediaFile = Bun.file(mediaFilePath);
        if (await mediaFile.exists()) {
          deck.addMedia(mediaFileName, await mediaFile.arrayBuffer());
          includedMediaFiles.add(mediaFileName);
        } else {
          console.warn(
            `[build] Missing generated audio file for sentence ${row.SentenceId}: ${mediaFilePath}`,
          );
        }
      }
    }

    deck.addCard(
      row.Sentence,
      row.SentenceTranslation,
      row.Keyword,
      row.SentenceId,
      row.cardPayload,
      row.difficulty,
      audioFieldValue,
      {
        sortField: runtime.ankiSortField,
        tags: [
          `sentence_lang_${config.sentenceLanguage}`,
          `translation_lang_${config.translationLanguage}`,
          `keyword_${row.Keyword}`,
        ],
      },
    );
  }

  const apkgBlob = await deck.save();
  await mkdir(dirname(config.outputPath), { recursive: true });
  await Bun.write(config.outputPath, apkgBlob);
  return { cardCount: rows.length };
}
