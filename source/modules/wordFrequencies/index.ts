export const FREQUENCY_WORDS_FILE_EXTENSION = ".txt";

export {
  buildSourceUrl,
  DEFAULT_FREQUENCY_SPECS,
  DEFAULT_FREQUENCY_YEAR,
  downloadAndWriteWordList,
  getOutputPath,
  isValidToken,
  parseCliArgs,
  parseSpec,
  runUpdateFrequencyWords,
} from "./updateFrequencyWords";

export type { FrequencySpec } from "./updateFrequencyWords";
