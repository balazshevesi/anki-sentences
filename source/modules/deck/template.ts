import { existsSync } from "node:fs";
import {
  APP_BUILD_COMMAND,
  APP_DIST_INDEX_HTML_PATH,
} from "../app/index";

const APP_DIST_HTML_PATH = APP_DIST_INDEX_HTML_PATH;

export async function loadQuestionFormatHtml(): Promise<string> {
  if (!existsSync(APP_DIST_HTML_PATH)) {
    throw new Error(
      `Missing app bundle at scripts/modules/app/dist/index.html. Run \`${APP_BUILD_COMMAND}\` first.`,
    );
  }

  return await Bun.file(APP_DIST_HTML_PATH).text();
}
