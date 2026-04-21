export const APP_MODULE_ROOT = new URL("./", import.meta.url);
export const APP_DIST_DIR = new URL("./dist/", APP_MODULE_ROOT);
export const APP_DIST_INDEX_HTML_PATH = new URL("./index.html", APP_DIST_DIR);

export const APP_BUILD_COMMAND = "bun run app:build";

export function resolveAppDistAssetPath(fileName: string): URL {
  return new URL(fileName, APP_DIST_DIR);
}
