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

function neutralizeAnkiMustacheInBundle(value: string): string {
  return value.replaceAll("{{", "{ {");
}

const FFMPEG_BINARY = "ffmpeg";
const TEMPLATE_AUDIO_EXTENSION = "mp3";

const ANKI_COMPAT_POLYFILLS = `<script>(function(){if(typeof globalThis==="undefined"){Object.defineProperty(Object.prototype,"__globalThis__",{get:function(){return this},configurable:true});__globalThis__.globalThis=__globalThis__;delete Object.prototype.__globalThis__;}if(!Object.fromEntries){Object.fromEntries=function(iterable){if(iterable==null){throw new TypeError("Cannot convert undefined or null to object")}var obj={};if(Array.isArray(iterable)){for(var i=0;i<iterable.length;i+=1){var arrayItem=iterable[i];if(!arrayItem||arrayItem.length<2){throw new TypeError("Iterator value "+arrayItem+" is not an entry object")}obj[arrayItem[0]]=arrayItem[1];}return obj;}var iterator=iterable[typeof Symbol!="undefined"&&Symbol.iterator?Symbol.iterator:"@@iterator"];if(typeof iterator!="function"){throw new TypeError("Object is not iterable")}var stepIterator=iterator.call(iterable);for(var step=stepIterator.next();!step.done;step=stepIterator.next()){var item=step.value;if(!item||item.length<2){throw new TypeError("Iterator value "+item+" is not an entry object")}obj[item[0]]=item[1];}return obj;};}if(!Array.prototype.at){Array.prototype.at=function(index){var length=this.length>>>0;var relativeIndex=Number(index)||0;var normalizedIndex=relativeIndex>=0?relativeIndex:length+relativeIndex;if(normalizedIndex<0||normalizedIndex>=length){return undefined;}return this[normalizedIndex];};}if(!String.prototype.replaceAll){String.prototype.replaceAll=function(searchValue,replaceValue){if(searchValue instanceof RegExp){if(!searchValue.global){throw new TypeError("String.prototype.replaceAll called with a non-global RegExp argument")}return this.replace(searchValue,replaceValue);}return this.split(String(searchValue)).join(String(replaceValue));};}})();</script>`;

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
  const questionFormatHtml = neutralizeAnkiMustacheInBundle(
    templateBundle.html,
  );

  const questionFormat = `
    <div id="front" class="card-template-loading" style="visibility: hidden">{{Sentence}}</div>
    <div id="cardPayload" hidden>{{cardPayload}}</div>
    <card-config hidden autoplay="true" replaykeybind="r"></card-config>
    ${ANKI_COMPAT_POLYFILLS}
    ${questionFormatHtml}`;
  const answerFormat = `
    {{FrontSide}}
    <hr id="answer">
    <div class="mx-auto max-w-3xl p-5 font-serif leading-normal sm:p-6">
      <div class="text-center text-2xl leading-normal sm:text-3xl sm:leading-relaxed">{{SentenceTranslation}}</div>
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
