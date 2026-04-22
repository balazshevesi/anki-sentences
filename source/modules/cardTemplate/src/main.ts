import { mount } from "svelte";
import App from "./App.svelte";
import "./index.css";

type CardPayload = {
  cardText: string;
  wordByWord: Record<string, WordTranslation>;
};

type WordTranslation = {
  translatedText: string;
  alternatives: string[];
  frequency: WordFrequencyInfo;
};

type WordFrequencyInfo = {
  rank: number | null;
  occurrencePercentage: number | null;
  rarity: string;
  hint: string;
};

type TemplatePayload = CardPayload & {
  target: HTMLElement;
};

function parseWordTranslation(value: unknown): WordTranslation {
  const defaultFrequency: WordFrequencyInfo = {
    rank: null,
    occurrencePercentage: null,
    rarity: "very_rare",
    hint: "",
  };

  const parseFrequency = (rawValue: unknown): WordFrequencyInfo => {
    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
      return defaultFrequency;
    }

    const rawFrequency = rawValue as {
      rank?: unknown;
      occurrencePercentage?: unknown;
      rarity?: unknown;
      hint?: unknown;
    };

    const rank =
      typeof rawFrequency.rank === "number" && Number.isFinite(rawFrequency.rank)
        ? rawFrequency.rank
        : null;
    const occurrencePercentage =
      typeof rawFrequency.occurrencePercentage === "number"
      && Number.isFinite(rawFrequency.occurrencePercentage)
        ? rawFrequency.occurrencePercentage
        : null;

    return {
      rank,
      occurrencePercentage,
      rarity:
        typeof rawFrequency.rarity === "string"
          ? rawFrequency.rarity
          : defaultFrequency.rarity,
      hint:
        typeof rawFrequency.hint === "string"
          ? rawFrequency.hint
          : defaultFrequency.hint,
    };
  };

  if (typeof value === "string") {
    return {
      translatedText: value,
      alternatives: [],
      frequency: defaultFrequency,
    };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      translatedText: "",
      alternatives: [],
      frequency: defaultFrequency,
    };
  }

  const wordTranslation = value as {
    translatedText?: unknown;
    alternatives?: unknown;
    frequency?: unknown;
  };

  const translatedText =
    typeof wordTranslation.translatedText === "string"
      ? wordTranslation.translatedText
      : "";
  const alternatives = Array.isArray(wordTranslation.alternatives)
    ? wordTranslation.alternatives.map((alternative) => String(alternative))
    : [];

  return {
    translatedText,
    alternatives,
    frequency: parseFrequency(wordTranslation.frequency),
  };
}

function parseWordByWord(raw: string): Record<string, WordTranslation> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).map(([word, translation]) => [word, parseWordTranslation(translation)]),
    );
  } catch {
    return {};
  }
}

function readTemplatePayload(): TemplatePayload | null {
  const frontElement = document.getElementById("front");
  const wordByWordElement = document.getElementById("wordByWord");

  if (!frontElement || !wordByWordElement) {
    return null;
  }

  const cardText = frontElement.innerText;
  const wordByWord = parseWordByWord(wordByWordElement.innerText);

  frontElement.innerText = "";

  return {
    target: frontElement,
    cardText,
    wordByWord,
  };
}

function readDevelopmentPayload(): TemplatePayload {
  const target = document.createElement("div");
  target.id = "front";
  document.body.appendChild(target);
  const cardText = "I am learning a new language today.";
  const wordByWord = {
    I: {
      translatedText: "Jag",
      alternatives: ["Mig"],
      frequency: {
        rank: 2,
        occurrencePercentage: 7.2,
        rarity: "very_common",
        hint: "Very common (top 2)",
      },
    },
    am: {
      translatedText: "är",
      alternatives: [],
      frequency: {
        rank: 26,
        occurrencePercentage: 1.7,
        rarity: "very_common",
        hint: "Very common (top 26)",
      },
    },
    learning: {
      translatedText: "lär",
      alternatives: ["studerar"],
      frequency: {
        rank: 7500,
        occurrencePercentage: 0.01,
        rarity: "uncommon",
        hint: "Uncommon (rank 7,500)",
      },
    },
    a: {
      translatedText: "en",
      alternatives: [],
      frequency: {
        rank: 5,
        occurrencePercentage: 3.8,
        rarity: "very_common",
        hint: "Very common (top 5)",
      },
    },
    new: {
      translatedText: "ny",
      alternatives: ["nytt"],
      frequency: {
        rank: 450,
        occurrencePercentage: 0.7,
        rarity: "very_common",
        hint: "Very common (top 450)",
      },
    },
    language: {
      translatedText: "språk",
      alternatives: [],
      frequency: {
        rank: 3000,
        occurrencePercentage: 0.06,
        rarity: "common",
        hint: "Common (rank 3,000)",
      },
    },
    "today.": {
      translatedText: "idag",
      alternatives: ["i dag"],
      frequency: {
        rank: 280,
        occurrencePercentage: 0.9,
        rarity: "very_common",
        hint: "Very common (top 280)",
      },
    },
  };
  return {
    target,
    cardText,
    wordByWord,
  };
}

const payload =
  readTemplatePayload() ??
  (import.meta.env.DEV ? readDevelopmentPayload() : null);

if (!payload) {
  throw new Error("Missing expected card fields in template.");
}

mount(App, {
  target: payload.target,
  props: {
    cardText: payload.cardText,
    wordByWord: payload.wordByWord,
  },
});
