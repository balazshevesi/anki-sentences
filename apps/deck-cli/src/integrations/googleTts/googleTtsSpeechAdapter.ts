import { isSupportedLanguageCode } from "../tatoeba/index";
import {
  createGoogleTtsErrorMetadata,
  generateGoogleTtsAudioMetadata,
  type GoogleTtsConfig,
} from "./googleTts";
import { resolveGoogleTtsLanguageCode } from "./googleTtsLanguage";
import type {
  SpeechSynthesisConfig,
  SpeechSynthesisInput,
  SpeechSynthesisPort,
} from "../ports/index";

type ResolveLanguageCodeFn = typeof resolveGoogleTtsLanguageCode;
type GenerateGoogleTtsAudioMetadataFn = typeof generateGoogleTtsAudioMetadata;
type CreateGoogleTtsErrorMetadataFn = typeof createGoogleTtsErrorMetadata;

function toGoogleTtsConfig(config: SpeechSynthesisConfig): GoogleTtsConfig {
  return {
    accessToken: config.accessToken,
    languageCode: config.languageCode,
    voiceName: config.voiceName,
    speakingRate: config.speakingRate,
    pitch: config.pitch,
    audioOutputDir: config.audioOutputDir,
    quotaProject: config.quotaProject,
  };
}

export function createGoogleTtsSpeechAdapter(options?: {
  resolveLanguageCodeFn?: ResolveLanguageCodeFn;
  generateGoogleTtsAudioMetadataFn?: GenerateGoogleTtsAudioMetadataFn;
  createGoogleTtsErrorMetadataFn?: CreateGoogleTtsErrorMetadataFn;
}): SpeechSynthesisPort {
  const resolveLanguageCodeFn =
    options?.resolveLanguageCodeFn ?? resolveGoogleTtsLanguageCode;
  const generateGoogleTtsAudioMetadataFn =
    options?.generateGoogleTtsAudioMetadataFn ?? generateGoogleTtsAudioMetadata;
  const createGoogleTtsErrorMetadataFn =
    options?.createGoogleTtsErrorMetadataFn ?? createGoogleTtsErrorMetadata;

  return {
    resolveLanguageCode(sentenceLanguage: string): string | undefined {
      if (!isSupportedLanguageCode(sentenceLanguage)) {
        return undefined;
      }

      return resolveLanguageCodeFn(sentenceLanguage);
    },
    async synthesize(input: SpeechSynthesisInput, config: SpeechSynthesisConfig) {
      return generateGoogleTtsAudioMetadataFn(
        {
          SentenceId: input.sentenceId,
          Sentence: input.sentence,
        },
        toGoogleTtsConfig(config),
      );
    },
    createErrorMetadata(sentenceId: string, message: string) {
      return createGoogleTtsErrorMetadataFn(sentenceId, message);
    },
  };
}
