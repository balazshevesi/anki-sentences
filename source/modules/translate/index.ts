export const ARGOS_TRANSLATE_DEFAULT_HOST = "127.0.0.1";
export const ARGOS_TRANSLATE_DEFAULT_PORT = 8000;
export const ARGOS_TRANSLATE_ENDPOINT_PATH = "/translate";
export const ARGOS_TRANSLATE_HEALTH_PATH = "/health";

export const DEFAULT_ARGOS_TRANSLATE_URL = `http://${ARGOS_TRANSLATE_DEFAULT_HOST}:${ARGOS_TRANSLATE_DEFAULT_PORT}${ARGOS_TRANSLATE_ENDPOINT_PATH}`;

export const ARGOS_TRANSLATE_MODULE_ROOT = new URL("./", import.meta.url);
export const ARGOS_TRANSLATE_APP_PATH = new URL("./main.py", ARGOS_TRANSLATE_MODULE_ROOT);

export function buildArgosEndpointUrl(baseUrl: string): string {
  return new URL(ARGOS_TRANSLATE_ENDPOINT_PATH, baseUrl).toString();
}
