import { existsSync } from "node:fs";
import {
  APP_BUILD_COMMAND,
  APP_DIST_INDEX_HTML_PATH,
} from "../../../card-template/index";

export type QuestionTemplateBundle = {
  html: string;
  css: string;
};

function extractInlineCss(html: string): {
  htmlWithoutCss: string;
  css: string;
} {
  const styleTagPattern = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let css = "";

  const htmlWithoutCss = html.replace(styleTagPattern, (_match, cssContent) => {
    if (typeof cssContent === "string" && cssContent.trim().length > 0) {
      css += `${cssContent}\n`;
    }

    return "";
  });

  return {
    htmlWithoutCss: htmlWithoutCss.trim(),
    css: css.trim(),
  };
}

export async function loadQuestionFormatHtml(): Promise<string> {
  if (!existsSync(APP_DIST_INDEX_HTML_PATH)) {
    throw new Error(
      `Missing app bundle at apps/card-template/dist/index.html. Run \`${APP_BUILD_COMMAND}\` first.`,
    );
  }

  return await Bun.file(APP_DIST_INDEX_HTML_PATH).text();
}

export async function loadQuestionTemplateBundle(): Promise<QuestionTemplateBundle> {
  const questionFormatHtml = await loadQuestionFormatHtml();
  const { htmlWithoutCss, css } = extractInlineCss(questionFormatHtml);

  return {
    html: htmlWithoutCss,
    css,
  };
}
