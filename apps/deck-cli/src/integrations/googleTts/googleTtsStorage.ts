import { join } from "node:path";

export async function writeAudioBufferToOutputFile(
  outputDir: string,
  audioFileName: string,
  audioBuffer: Buffer,
): Promise<string> {
  const outputFilePath = join(outputDir, audioFileName);
  await Bun.write(outputFilePath, audioBuffer);
  return outputFilePath;
}
