import { mount } from "svelte";
import App from "./App.svelte";
import "./index.css";

type CardPayload = {
  cardText: string;
  wordByWord: string[];
};

type TemplatePayload = CardPayload & {
  target: HTMLElement;
};

function parseWordByWord(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((item) =>
      typeof item === "string" ? item : String(item),
    );
  } catch {
    return [];
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
  const wordByWord = ["Jag", "am", "lär", "en", "ny", "språk", "idag"];
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
