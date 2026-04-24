import { existsSync } from "node:fs";
import {
  APP_BUILD_COMMAND,
  APP_DIST_INDEX_HTML_PATH,
} from "../../../card-template/index";

export async function loadQuestionFormatHtml(): Promise<string> {
  if (!existsSync(APP_DIST_INDEX_HTML_PATH)) {
    throw new Error(
      `Missing app bundle at apps/card-template/dist/index.html. Run \`${APP_BUILD_COMMAND}\` first.`,
    );
  }

  return await Bun.file(APP_DIST_INDEX_HTML_PATH).text();
}
