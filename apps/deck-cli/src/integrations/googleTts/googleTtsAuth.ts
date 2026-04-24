import { GoogleAuth } from "google-auth-library";

const GOOGLE_TTS_SYNTHESIZE_URL =
  "https://texttospeech.googleapis.com/v1beta1/text:synthesize";
const GOOGLE_CLOUD_PLATFORM_SCOPE =
  "https://www.googleapis.com/auth/cloud-platform";

const googleAuth = new GoogleAuth({ scopes: [GOOGLE_CLOUD_PLATFORM_SCOPE] });

type GoogleTtsAuthConfig = {
  accessToken?: string;
  quotaProject?: string;
};

function toAuthResolutionError(message: string): Error {
  return new Error(
    [
      message,
      "Google Text-to-Speech requires OAuth2 credentials (API keys are not supported).",
      "Use one of these approaches:",
      "- Preferred local setup: `gcloud auth application-default login`",
      "- Service account setup: set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON key file",
      "- Manual token setup: set audio.accessToken in deck.config.jsonc or GOOGLE_TTS_ACCESS_TOKEN",
    ].join("\n"),
  );
}

function resolveQuotaProjectOverride(
  config: GoogleTtsAuthConfig,
): string | undefined {
  const fromConfig = config.quotaProject?.trim();
  if (fromConfig && fromConfig.length > 0) {
    return fromConfig;
  }

  const fromEnv = Bun.env.GOOGLE_CLOUD_QUOTA_PROJECT?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }

  return undefined;
}

export async function resolveGoogleAuthHeaders(
  config: GoogleTtsAuthConfig,
): Promise<Headers> {
  const headers = new Headers();

  const configuredToken = config.accessToken?.trim();
  if (configuredToken) {
    headers.set("authorization", `Bearer ${configuredToken}`);
  } else {
    try {
      const client = await googleAuth.getClient();
      const authHeaders = await client.getRequestHeaders(
        GOOGLE_TTS_SYNTHESIZE_URL,
      );
      for (const [name, value] of authHeaders.entries()) {
        headers.set(name, value);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw toAuthResolutionError(
        `Failed to resolve Google OAuth2 credentials: ${reason}`,
      );
    }
  }

  const quotaProjectOverride = resolveQuotaProjectOverride(config);
  if (quotaProjectOverride && !headers.has("x-goog-user-project")) {
    headers.set("x-goog-user-project", quotaProjectOverride);
  }

  return headers;
}
