const GOOGLE_TTS_SYNTHESIZE_URL =
  "https://texttospeech.googleapis.com/v1beta1/text:synthesize";
const GOOGLE_TTS_API_AUDIO_ENCODING = "LINEAR16";
const GOOGLE_TTS_TIMEOUT_MS = 60_000;

type GoogleTtsApiResponse = {
  audioContent?: unknown;
  timepoints?: unknown;
  error?: {
    message?: unknown;
  };
};

type GoogleTtsHttpConfig = {
  languageCode: string;
  voiceName?: string;
  speakingRate: number;
  pitch: number;
};

type GoogleTtsSynthesisResult = {
  linear16AudioBuffer: Buffer;
  timepoints: unknown;
};

function toGoogleApiErrorMessage(
  statusCode: number,
  payload: GoogleTtsApiResponse | null,
  responseBody: string,
): string {
  const apiErrorMessage = payload?.error?.message;
  if (
    typeof apiErrorMessage === "string" &&
    apiErrorMessage.trim().length > 0
  ) {
    return `Google Text-to-Speech API request failed (${statusCode}): ${apiErrorMessage}`;
  }

  const body = responseBody.trim();
  if (body.length > 0) {
    return `Google Text-to-Speech API request failed (${statusCode}): ${body}`;
  }

  return `Google Text-to-Speech API request failed with status ${statusCode}.`;
}

export async function requestGoogleTtsSynthesis(args: {
  ssml: string;
  config: GoogleTtsHttpConfig;
  headers: Headers;
}): Promise<GoogleTtsSynthesisResult> {
  const voice: { languageCode: string; name?: string } = {
    languageCode: args.config.languageCode,
  };
  if (args.config.voiceName && args.config.voiceName.trim().length > 0) {
    voice.name = args.config.voiceName;
  }

  const headers = new Headers(args.headers);
  headers.set("content-type", "application/json");

  const response = await fetch(GOOGLE_TTS_SYNTHESIZE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      input: {
        ssml: args.ssml,
      },
      voice,
      audioConfig: {
        audioEncoding: GOOGLE_TTS_API_AUDIO_ENCODING,
        speakingRate: args.config.speakingRate,
        pitch: args.config.pitch,
      },
      enableTimePointing: ["SSML_MARK"],
    }),
    signal: AbortSignal.timeout(GOOGLE_TTS_TIMEOUT_MS),
  });

  const responseBody = await response.text();
  let payload: GoogleTtsApiResponse | null = null;
  if (responseBody.trim().length > 0) {
    try {
      payload = JSON.parse(responseBody) as GoogleTtsApiResponse;
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw new Error(
      toGoogleApiErrorMessage(response.status, payload, responseBody),
    );
  }

  const audioContent = payload?.audioContent;
  if (typeof audioContent !== "string" || audioContent.length === 0) {
    throw new Error("Google Text-to-Speech API returned no audio content.");
  }

  return {
    linear16AudioBuffer: Buffer.from(audioContent, "base64"),
    timepoints: payload?.timepoints,
  };
}
