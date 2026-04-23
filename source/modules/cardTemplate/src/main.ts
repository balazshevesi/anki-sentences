import { mount } from "svelte";
import App from "./App.svelte";
import "./index.css";
import {
  parseCardPayloadJson,
  type CardPayload,
  type NgramTranslation,
  type WordTranslation,
} from "../../shared/cardPayload";

type AppCardPayload = {
  cardText: string;
  wordByWord: Record<string, WordTranslation>;
  ngramTranslations: NgramTranslation[];
};

type TemplatePayload = AppCardPayload & {
  target: HTMLElement;
};

function readTemplatePayload(): TemplatePayload | null {
  const frontElement = document.getElementById("front");
  const cardPayloadElement = document.getElementById("cardPayload");

  if (!frontElement || !cardPayloadElement) {
    return null;
  }

  const cardText = frontElement.innerText;
  const cardPayload: CardPayload = parseCardPayloadJson(cardPayloadElement.innerText);

  frontElement.innerText = "";

  return {
    target: frontElement,
    cardText,
    wordByWord: cardPayload.wordByWord,
    ngramTranslations: cardPayload.ngramTranslations,
  };
}

function readDevelopmentPayload(): TemplatePayload {
  const target = document.createElement("div");
  target.id = "front";
  document.body.appendChild(target);
  const cardText = "I am learning a new language today.";
  const wordByWord: Record<string, WordTranslation> = {
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
  const ngramTranslations: NgramTranslation[] = [
    {
      phrase: "i am learning",
      ngramLength: 3,
      translatedText: "tanulok",
      alternatives: ["épp tanulok"],
      occurrenceCount: 6,
      cardCount: 5,
      cardPercentage: 12.5,
    },
    {
      phrase: "new language",
      ngramLength: 2,
      translatedText: "új nyelv",
      alternatives: [],
      occurrenceCount: 9,
      cardCount: 7,
      cardPercentage: 17.5,
    },
  ];
  return {
    target,
    cardText,
    wordByWord,
    ngramTranslations,
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
    ngramTranslations: payload.ngramTranslations,
  },
});
