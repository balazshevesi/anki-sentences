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
};

type TemplatePayload = CardPayload & {
  target: HTMLElement;
};

function parseWordTranslation(value: unknown): WordTranslation {
  if (typeof value === "string") {
    return {
      translatedText: value,
      alternatives: [],
    };
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      translatedText: "",
      alternatives: [],
    };
  }

  const wordTranslation = value as {
    translatedText?: unknown;
    alternatives?: unknown;
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
    I: { translatedText: "Jag", alternatives: ["Mig"] },
    am: { translatedText: "är", alternatives: [] },
    learning: { translatedText: "lär", alternatives: ["studerar"] },
    a: { translatedText: "en", alternatives: [] },
    new: { translatedText: "ny", alternatives: ["nytt"] },
    language: { translatedText: "språk", alternatives: [] },
    "today.": { translatedText: "idag", alternatives: ["i dag"] },
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
