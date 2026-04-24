import type {
  ErrorAudioMetadata,
  ReadyAudioMetadata,
} from "../../contracts/audioMetadata";

export type SpeechSynthesisConfig = {
  accessToken?: string;
  languageCode: string;
  voiceName?: string;
  speakingRate: number;
  pitch: number;
  audioOutputDir: string;
  quotaProject?: string;
};

export type SpeechSynthesisInput = {
  sentenceId: string;
  sentence: string;
};

export interface SpeechSynthesisPort {
  resolveLanguageCode(sentenceLanguage: string): string | undefined;
  synthesize(
    input: SpeechSynthesisInput,
    config: SpeechSynthesisConfig,
  ): Promise<ReadyAudioMetadata>;
  createErrorMetadata(sentenceId: string, message: string): ErrorAudioMetadata;
}
