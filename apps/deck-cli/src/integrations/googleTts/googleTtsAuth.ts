import { homedir } from "node:os";
import { join } from "node:path";

const GCLOUD_BINARY = "gcloud";
const GCLOUD_TOKEN_TIMEOUT_MS = 20_000;
const GCLOUD_TOKEN_CACHE_TTL_MS = 50 * 60_000;
const ADC_CREDENTIALS_PATH = join(
  homedir(),
  ".config",
  "gcloud",
  "application_default_credentials.json",
);

let cachedAccessToken: { token: string; resolvedAtMs: number } | null = null;
let cachedAdcQuotaProject: string | null | undefined;

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

function normalizeProjectId(input: unknown): string | undefined {
  if (typeof input !== "string") {
    return undefined;
  }

  const normalized = input.trim();
  if (!normalized || normalized === "(unset)" || normalized === "null") {
    return undefined;
  }

  return normalized;
}

async function resolveQuotaProjectFromAdcFile(): Promise<string | undefined> {
  if (cachedAdcQuotaProject !== undefined) {
    return cachedAdcQuotaProject ?? undefined;
  }

  try {
    const file = Bun.file(ADC_CREDENTIALS_PATH);
    if (!(await file.exists())) {
      cachedAdcQuotaProject = null;
      return undefined;
    }

    const parsed = JSON.parse(await file.text()) as {
      quota_project_id?: unknown;
    };
    cachedAdcQuotaProject = normalizeProjectId(parsed.quota_project_id) ?? null;
    return cachedAdcQuotaProject ?? undefined;
  } catch {
    cachedAdcQuotaProject = null;
    return undefined;
  }
}

async function resolveQuotaProjectOverride(
  config: GoogleTtsAuthConfig,
): Promise<string | undefined> {
  const fromConfig = normalizeProjectId(config.quotaProject);
  if (fromConfig) {
    return fromConfig;
  }

  const fromEnv = normalizeProjectId(Bun.env.GOOGLE_CLOUD_QUOTA_PROJECT);
  if (fromEnv) {
    return fromEnv;
  }

  return await resolveQuotaProjectFromAdcFile();
}

async function resolveAccessTokenFromGcloud(): Promise<string> {
  if (
    cachedAccessToken &&
    Date.now() - cachedAccessToken.resolvedAtMs < GCLOUD_TOKEN_CACHE_TTL_MS
  ) {
    return cachedAccessToken.token;
  }

  let process: ReturnType<typeof Bun.spawn>;
  try {
    process = Bun.spawn(
      [GCLOUD_BINARY, "auth", "application-default", "print-access-token"],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw toAuthResolutionError(`Failed to start gcloud CLI: ${reason}`);
  }

  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    try {
      process.kill();
    } catch {}
  }, GCLOUD_TOKEN_TIMEOUT_MS);

  const stdoutPromise =
    process.stdout && typeof process.stdout !== "number"
      ? new Response(process.stdout).text()
      : Promise.resolve("");
  const stderrPromise =
    process.stderr && typeof process.stderr !== "number"
      ? new Response(process.stderr).text()
      : Promise.resolve("");

  const [exitCode, stdoutText, stderrText] = await Promise.all([
    process.exited,
    stdoutPromise,
    stderrPromise,
  ]);
  clearTimeout(timeoutId);

  if (timedOut) {
    throw toAuthResolutionError(
      `gcloud token resolution timed out after ${GCLOUD_TOKEN_TIMEOUT_MS}ms.`,
    );
  }

  if (exitCode !== 0) {
    const stderrMessage = stderrText.trim();
    throw toAuthResolutionError(
      stderrMessage.length > 0
        ? `gcloud token resolution failed: ${stderrMessage}`
        : `gcloud token resolution failed with exit code ${exitCode}.`,
    );
  }

  const token = stdoutText.trim();
  if (token.length === 0) {
    throw toAuthResolutionError(
      "gcloud returned an empty access token for application-default credentials.",
    );
  }

  cachedAccessToken = {
    token,
    resolvedAtMs: Date.now(),
  };

  return token;
}

export async function resolveGoogleAuthHeaders(
  config: GoogleTtsAuthConfig,
): Promise<Headers> {
  const headers = new Headers();

  const configuredToken = config.accessToken?.trim();
  const accessToken =
    configuredToken && configuredToken.length > 0
      ? configuredToken
      : await resolveAccessTokenFromGcloud();
  headers.set("authorization", `Bearer ${accessToken}`);

  const quotaProjectOverride = await resolveQuotaProjectOverride(config);
  if (quotaProjectOverride && !headers.has("x-goog-user-project")) {
    headers.set("x-goog-user-project", quotaProjectOverride);
  }

  return headers;
}
