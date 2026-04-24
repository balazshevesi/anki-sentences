import type {
  WordFrequencyInfo,
  WordRarity,
} from "../shared/cardPayload";

const DEFAULT_WORD_LIST_SIZE = "50k";
const MODULE_DIR = new URL("./", import.meta.url);

type FrequencyRow = {
  rank: number;
  count: number;
  occurrencePercentage: number;
};

type FrequencyLookup = {
  getWordFrequency: (word: string) => WordFrequencyInfo;
  sourceFile: string | null;
};

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (!character) {
      continue;
    }

    if (inQuotes) {
      if (character === '"') {
        const nextCharacter = line[index + 1];
        if (nextCharacter === '"') {
          currentField += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += character;
      }
      continue;
    }

    if (character === '"') {
      inQuotes = true;
      continue;
    }

    if (character === ",") {
      fields.push(currentField);
      currentField = "";
      continue;
    }

    currentField += character;
  }

  fields.push(currentField);
  return fields;
}

function parseFrequencyCsv(content: string): Map<string, FrequencyRow> {
  const rows = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  const headerLine = rows.shift();
  if (!headerLine) {
    return new Map();
  }

  const header = parseCsvLine(headerLine);
  const rankIndex = header.indexOf("rank");
  const wordIndex = header.indexOf("word");
  const countIndex = header.indexOf("count");
  const occurrenceIndex = header.indexOf("occurrence_percentage");

  if (
    rankIndex < 0
    || wordIndex < 0
    || countIndex < 0
    || occurrenceIndex < 0
  ) {
    return new Map();
  }

  const frequencyMap = new Map<string, FrequencyRow>();
  for (const row of rows) {
    if (row.trim().length === 0) {
      continue;
    }

    const fields = parseCsvLine(row);
    const word = fields[wordIndex]?.trim().toLowerCase();
    const rank = Number.parseInt(fields[rankIndex] ?? "", 10);
    const count = Number.parseInt(fields[countIndex] ?? "", 10);
    const occurrencePercentage = Number.parseFloat(fields[occurrenceIndex] ?? "");

    if (
      !word
      || !Number.isSafeInteger(rank)
      || rank <= 0
      || !Number.isSafeInteger(count)
      || count <= 0
      || !Number.isFinite(occurrencePercentage)
      || occurrencePercentage <= 0
    ) {
      continue;
    }

    frequencyMap.set(word, {
      rank,
      count,
      occurrencePercentage,
    });
  }

  return frequencyMap;
}

function parseFrequencyTxt(content: string): Map<string, FrequencyRow> {
  const rawRows = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(/\s+/))
    .map((parts) => {
      const [word, rawCount] = parts;
      const count = Number.parseInt(rawCount ?? "", 10);
      return {
        word: word?.toLowerCase() ?? "",
        count,
      };
    })
    .filter(
      (row) => row.word.length > 0 && Number.isSafeInteger(row.count) && row.count > 0,
    );

  const totalCount = rawRows.reduce((sum, row) => sum + row.count, 0);
  if (totalCount <= 0) {
    return new Map();
  }

  return new Map(
    rawRows.map((row, index) => [
      row.word,
      {
        rank: index + 1,
        count: row.count,
        occurrencePercentage: (row.count / totalCount) * 100,
      },
    ]),
  );
}

function getFrequencyFileUrls(languageCode: string): URL[] {
  return [
    new URL(`${languageCode}${DEFAULT_WORD_LIST_SIZE}.csv`, MODULE_DIR),
    new URL(`${languageCode}${DEFAULT_WORD_LIST_SIZE}.txt`, MODULE_DIR),
  ];
}

function getLookupCandidates(word: string): string[] {
  const trimmed = word.trim().toLowerCase();
  if (!trimmed) {
    return [];
  }

  const strippedEdges = trimmed.replace(
    /^[^\p{L}\p{N}'’]+|[^\p{L}\p{N}'’]+$/gu,
    "",
  );
  const normalizedApostrophe = strippedEdges.replaceAll("’", "'");
  const noApostrophe = normalizedApostrophe.replaceAll("'", "");

  const candidates = [trimmed, strippedEdges, normalizedApostrophe, noApostrophe]
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0);

  return Array.from(new Set(candidates));
}

function getRarityLabel(rank: number | null, listSize: number): WordRarity {
  if (rank === null || rank > listSize) {
    return "very_rare";
  }
  if (rank <= 1000) {
    return "very_common";
  }
  if (rank <= 5000) {
    return "common";
  }
  if (rank <= 20000) {
    return "uncommon";
  }
  return "rare";
}

function getRarityHint(rank: number | null, listSize: number): string {
  if (rank === null || rank > listSize) {
    return `Very rare (outside top ${listSize.toLocaleString()} words)`;
  }
  if (rank <= 1000) {
    return `Very common (top ${rank.toLocaleString()})`;
  }
  if (rank <= 5000) {
    return `Common (rank ${rank.toLocaleString()})`;
  }
  if (rank <= 20000) {
    return `Uncommon (rank ${rank.toLocaleString()})`;
  }
  return `Rare (rank ${rank.toLocaleString()})`;
}

function createLookup(map: Map<string, FrequencyRow>): FrequencyLookup {
  const listSize = map.size;
  const fallback: WordFrequencyInfo = {
    rank: null,
    occurrencePercentage: null,
    rarity: "very_rare",
    hint: `Very rare (outside top ${listSize.toLocaleString()} words)`,
  };

  return {
    sourceFile: null,
    getWordFrequency: (word: string): WordFrequencyInfo => {
      if (!word.trim()) {
        return {
          rank: null,
          occurrencePercentage: null,
          rarity: "very_rare",
          hint: "",
        };
      }

      for (const candidate of getLookupCandidates(word)) {
        const row = map.get(candidate);
        if (!row) {
          continue;
        }

        return {
          rank: row.rank,
          occurrencePercentage: row.occurrencePercentage,
          rarity: getRarityLabel(row.rank, listSize),
          hint: getRarityHint(row.rank, listSize),
        };
      }

      return fallback;
    },
  };
}

export async function loadWordFrequencyLookup(
  languageCode: string,
): Promise<FrequencyLookup> {
  const normalizedLanguageCode = languageCode.trim().toLowerCase();
  if (!normalizedLanguageCode) {
    return {
      sourceFile: null,
      getWordFrequency: () => ({
        rank: null,
        occurrencePercentage: null,
        rarity: "very_rare",
        hint: "",
      }),
    };
  }

  for (const url of getFrequencyFileUrls(normalizedLanguageCode)) {
    const file = Bun.file(url);
    if (!(await file.exists())) {
      continue;
    }

    const content = await file.text();
    const map = url.pathname.endsWith(".csv")
      ? parseFrequencyCsv(content)
      : parseFrequencyTxt(content);

    if (map.size === 0) {
      continue;
    }

    const lookup = createLookup(map);
    return {
      sourceFile: url.pathname,
      getWordFrequency: lookup.getWordFrequency,
    };
  }

  return {
    sourceFile: null,
    getWordFrequency: () => ({
      rank: null,
      occurrencePercentage: null,
      rarity: "very_rare",
      hint: "",
    }),
  };
}
