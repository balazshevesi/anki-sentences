import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUTPUT_AUDIO_EXTENSION = "mp3";
const FFMPEG_BINARY = "ffmpeg";
const FFMPEG_TRANSCODE_TIMEOUT_MS = 20_000;

function toAudioTranscodeError(details: string): Error {
  return new Error(
    [
      `Failed to transcode Google Text-to-Speech output to MP3: ${details}`,
      "Install ffmpeg and ensure it is available on PATH.",
    ].join(" "),
  );
}

export async function transcodeLinear16ToMp3(
  linear16AudioBuffer: Buffer,
): Promise<Buffer> {
  const fileStem = `tts-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const inputPath = join(tmpdir(), `${fileStem}.wav`);
  const outputPath = join(tmpdir(), `${fileStem}.${OUTPUT_AUDIO_EXTENSION}`);

  await Bun.write(inputPath, linear16AudioBuffer);

  try {
    let process: ReturnType<typeof Bun.spawn>;
    try {
      process = Bun.spawn(
        [
          FFMPEG_BINARY,
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          inputPath,
          "-c:a",
          "libmp3lame",
          "-q:a",
          "4",
          outputPath,
        ],
        {
          stdout: "ignore",
          stderr: "pipe",
        },
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw toAudioTranscodeError(reason);
    }

    let transcodeTimedOut = false;
    const timeoutId = setTimeout(() => {
      transcodeTimedOut = true;
      try {
        process.kill();
      } catch {}
    }, FFMPEG_TRANSCODE_TIMEOUT_MS);

    const stderrPromise =
      process.stderr && typeof process.stderr !== "number"
        ? new Response(process.stderr).text()
        : Promise.resolve("");

    const exitCode = await process.exited;
    clearTimeout(timeoutId);

    const stderrOutput = (await stderrPromise).trim();
    if (transcodeTimedOut) {
      throw toAudioTranscodeError(
        `ffmpeg timed out after ${FFMPEG_TRANSCODE_TIMEOUT_MS}ms.`,
      );
    }

    if (exitCode !== 0) {
      throw toAudioTranscodeError(
        stderrOutput.length > 0
          ? stderrOutput
          : `ffmpeg exited with code ${exitCode}.`,
      );
    }

    const outputFile = Bun.file(outputPath);
    if (!(await outputFile.exists())) {
      throw toAudioTranscodeError(
        "ffmpeg completed without producing an output file.",
      );
    }

    return Buffer.from(await outputFile.arrayBuffer());
  } finally {
    await Promise.all([
      rm(inputPath, { force: true }),
      rm(outputPath, { force: true }),
    ]);
  }
}
