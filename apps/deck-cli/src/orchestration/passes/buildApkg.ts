import { default as Anki } from "anki-apkg-export";
import { mkdir } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { loadQuestionTemplateBundle } from "../../deck/template";
import { DECK_NOTE_FIELDS, readPipelineCsvRows } from "../../deck/csv";
import type { DeckBuildConfig, DeckRuntimeConfig } from "../../deck/types";
import { parseCardPayloadJson } from "../../contracts/cardPayload";
import { isReadyAudioMetadata } from "../../contracts/audioMetadata";

function escapeSqliteStringLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

const FFMPEG_BINARY = "ffmpeg";
const TEMPLATE_AUDIO_EXTENSION = "mp3";

function sanitizeCardPayloadForTemplate(
  rawPayload: string,
  templateAudioFileName: string | null,
): string {
  const parsedPayload = parseCardPayloadJson(rawPayload);
  const wordByWordWithoutFrequency = Object.fromEntries(
    Object.entries(parsedPayload.wordByWord).map(([word, translation]) => [
      word,
      {
        translatedText: translation.translatedText,
        alternatives: [...translation.alternatives],
      },
    ]),
  );

  if (!isReadyAudioMetadata(parsedPayload.audioMetadata)) {
    return JSON.stringify({
      ...parsedPayload,
      wordByWord: wordByWordWithoutFrequency,
    });
  }

  return JSON.stringify({
    ...parsedPayload,
    wordByWord: wordByWordWithoutFrequency,
    audioMetadata: {
      ...parsedPayload.audioMetadata,
      audioFileName:
        templateAudioFileName ?? parsedPayload.audioMetadata.audioFileName,
      ankiSoundTag: "",
    },
  });
}

function withExtension(fileName: string, extension: string): string {
  const currentExtension = extname(fileName);
  if (currentExtension.length === 0) {
    return `${fileName}.${extension}`;
  }

  return `${fileName.slice(0, -currentExtension.length)}.${extension}`;
}

function isAacFile(fileName: string): boolean {
  return extname(fileName).toLowerCase() === ".aac";
}

async function ensureTemplatePlayableAudioFileName(
  audioOutputDir: string,
  sourceAudioFileName: string,
): Promise<string> {
  if (!isAacFile(sourceAudioFileName)) {
    return sourceAudioFileName;
  }

  const targetAudioFileName = withExtension(
    sourceAudioFileName,
    TEMPLATE_AUDIO_EXTENSION,
  );
  const targetAudioPath = join(audioOutputDir, targetAudioFileName);
  if (await Bun.file(targetAudioPath).exists()) {
    return targetAudioFileName;
  }

  const sourceAudioPath = join(audioOutputDir, sourceAudioFileName);
  if (!(await Bun.file(sourceAudioPath).exists())) {
    return sourceAudioFileName;
  }

  try {
    const process = Bun.spawn(
      [
        FFMPEG_BINARY,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        sourceAudioPath,
        "-codec:a",
        "libmp3lame",
        "-q:a",
        "4",
        targetAudioPath,
      ],
      {
        stdout: "ignore",
        stderr: "pipe",
      },
    );

    const stderrPromise =
      process.stderr && typeof process.stderr !== "number"
        ? new Response(process.stderr).text()
        : Promise.resolve("");
    const exitCode = await process.exited;

    if (exitCode !== 0) {
      const stderrOutput = (await stderrPromise).trim();
      console.warn(
        `[build] Failed to transcode '${sourceAudioFileName}' to MP3 for the card player: ${stderrOutput || `ffmpeg exited with code ${exitCode}`}`,
      );
      return sourceAudioFileName;
    }

    return targetAudioFileName;
  } catch (error) {
    console.warn(
      `[build] Failed to transcode '${sourceAudioFileName}' to MP3 for the card player: ${error instanceof Error ? error.message : String(error)}`,
    );
    return sourceAudioFileName;
  }
}

export async function runBuildApkgPass(
  config: DeckBuildConfig,
  csvPath: string,
  runtime: DeckRuntimeConfig,
): Promise<{ cardCount: number }> {
  const rows = await readPipelineCsvRows(csvPath);
  const templateBundle = await loadQuestionTemplateBundle();

  const questionFormat = templateBundle.html;
  const answerFormat = `
    {{FrontSide}}
    <hr id="answer">
    <div class="card-template-answer">
      <div class="card-template-answer-translation">{{SentenceTranslation}}</div>
    </div>`;

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
    const templateAudioFileName = isReadyAudioMetadata(parsedAudioMetadata)
      ? await ensureTemplatePlayableAudioFileName(
          config.audioOutputDir,
          parsedAudioMetadata.audioFileName,
        )
      : null;
    const audioFieldValue =
      row.audio.trim().length > 0
        ? row.audio
        : isReadyAudioMetadata(parsedAudioMetadata)
          ? parsedAudioMetadata.ankiSoundTag
          : "";
    if (isReadyAudioMetadata(parsedAudioMetadata)) {
      const mediaFileName =
        templateAudioFileName ?? parsedAudioMetadata.audioFileName;
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
      sanitizeCardPayloadForTemplate(row.cardPayload, templateAudioFileName),
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
