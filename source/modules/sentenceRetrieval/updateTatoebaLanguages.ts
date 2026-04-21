export const TATOEBA_LANGUAGE_SOURCE_URL = "https://tatoeba.org/en/downloads";
export const TATOEBA_LANGUAGES_TARGET_FILE = new URL(
  "./tatoebaLanguages.ts",
  import.meta.url,
);

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  quot: '"',
};

export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (fullMatch, rawEntity) => {
    if (rawEntity.startsWith("#x") || rawEntity.startsWith("#X")) {
      const codePoint = Number.parseInt(rawEntity.slice(2), 16);
      return Number.isNaN(codePoint) ? fullMatch : String.fromCodePoint(codePoint);
    }

    if (rawEntity.startsWith("#")) {
      const codePoint = Number.parseInt(rawEntity.slice(1), 10);
      return Number.isNaN(codePoint) ? fullMatch : String.fromCodePoint(codePoint);
    }

    return NAMED_HTML_ENTITIES[rawEntity] ?? fullMatch;
  });
}

export function extractLanguagesJson(html: string): Record<string, string> {
  const match = html.match(
    /languages-json="(\{.*?\})"\s+selected-language="ctrl\.langFrom"/s,
  );

  if (!match) {
    throw new Error("Could not locate languages-json payload in Tatoeba downloads page.");
  }

  const encodedJson = match[1];
  if (!encodedJson) {
    throw new Error("Could not extract languages-json capture group.");
  }

  const decodedJson = decodeHtmlEntities(encodedJson);
  const parsed = JSON.parse(decodedJson) as unknown;

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Unexpected languages-json payload shape.");
  }

  const languages: Record<string, string> = {};
  for (const [code, name] of Object.entries(parsed)) {
    if (typeof code !== "string" || typeof name !== "string") {
      throw new Error("Unexpected language entry in languages-json payload.");
    }

    languages[code] = name;
  }

  return languages;
}

export function renderLanguagesFile(languages: Record<string, string>): string {
  const lines: string[] = [];

  lines.push("// Generated from Tatoeba downloads language selector data.");
  lines.push("// Source: https://tatoeba.org/en/downloads");
  lines.push("");
  lines.push("export const SUPPORTED_LANGUAGES = {");

  for (const [code, name] of Object.entries(languages)) {
    lines.push(`  ${JSON.stringify(code)}: ${JSON.stringify(name)},`);
  }

  lines.push("} as const;");
  lines.push("");
  lines.push("export type SupportedLanguageCode = keyof typeof SUPPORTED_LANGUAGES;");
  lines.push(
    "export type SupportedLanguageName = (typeof SUPPORTED_LANGUAGES)[SupportedLanguageCode];",
  );
  lines.push("");
  lines.push("export const SUPPORTED_LANGUAGE_CODES = Object.keys(");
  lines.push("  SUPPORTED_LANGUAGES");
  lines.push(") as SupportedLanguageCode[];");
  lines.push("");
  lines.push("const SUPPORTED_LANGUAGE_CODE_SET = new Set<string>(SUPPORTED_LANGUAGE_CODES);");
  lines.push("");
  lines.push("export function isSupportedLanguageCode(code: string): code is SupportedLanguageCode {");
  lines.push("  return SUPPORTED_LANGUAGE_CODE_SET.has(code);");
  lines.push("}");

  return `${lines.join("\n")}\n`;
}

export async function updateTatoebaLanguages(options?: {
  sourceUrl?: string;
  targetFile?: URL;
}): Promise<void> {
  const sourceUrl = options?.sourceUrl ?? TATOEBA_LANGUAGE_SOURCE_URL;
  const targetFile = options?.targetFile ?? TATOEBA_LANGUAGES_TARGET_FILE;

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${sourceUrl} (HTTP ${response.status}).`);
  }

  const html = await response.text();
  const languages = extractLanguagesJson(html);
  const output = renderLanguagesFile(languages);

  await Bun.write(targetFile, output);
  console.log(
    `Updated ${targetFile.pathname} with ${Object.keys(languages).length} languages.`,
  );
}

if (import.meta.main) {
  await updateTatoebaLanguages();
}
