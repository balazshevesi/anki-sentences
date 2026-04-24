const APP_DIST_DIR = new URL("./dist/", import.meta.url);
export const APP_DIST_INDEX_HTML_PATH = new URL("./index.html", APP_DIST_DIR);

export const APP_BUILD_COMMAND = "bun run template:build";
