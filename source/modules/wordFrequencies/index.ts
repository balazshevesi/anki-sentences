export const FREQUENCY_WORDS_FILE_EXTENSION = ".csv";

export { loadWordFrequencyLookup } from "./lookup";

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
export type { WordFrequencyInfo, WordRarity } from "./lookup";
