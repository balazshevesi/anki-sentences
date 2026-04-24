import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUTPUT_AUDIO_EXTENSION = "aac";
const FFMPEG_BINARY = "ffmpeg";

function toAudioTranscodeError(details: string): Error {
  return new Error(
    [
      `Failed to transcode Google Text-to-Speech output to AAC: ${details}`,
      "Install ffmpeg and ensure it is available on PATH.",
    ].join(" "),
  );
}

export async function transcodeLinear16ToAac(
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
          "aac",
          "-b:a",
          "128k",
          "-f",
          "adts",
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

    const stderrOutput =
      process.stderr && typeof process.stderr !== "number"
        ? (await new Response(process.stderr).text()).trim()
        : "";
    const exitCode = await process.exited;
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
