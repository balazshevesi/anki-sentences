import { mount } from "svelte";
import App from "./App.svelte";
import "./index.css";
import {
  DEV_SAMPLE_CARD_PAYLOAD_JSON,
  DEV_SAMPLE_CARD_TEXT,
} from "./devSample";
import {
  parseCardPayloadJson,
  type CardPayload,
  type NgramTranslation,
  type WordTranslation,
} from "../../deck-cli/src/contracts/cardPayload";
import type { AudioMetadata } from "../../deck-cli/src/contracts/audioMetadata";

type AppCardPayload = {
  cardText: string;
  wordByWord: Record<string, WordTranslation>;
  ngramTranslations: NgramTranslation[];
  audioMetadata: AudioMetadata | null;
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
  const cardPayload: CardPayload = parseCardPayloadJson(
    cardPayloadElement.innerText,
  );

  frontElement.innerText = "";

  return {
    target: frontElement,
    cardText,
    wordByWord: cardPayload.wordByWord,
    ngramTranslations: cardPayload.ngramTranslations,
    audioMetadata: cardPayload.audioMetadata,
  };
}

function readDevelopmentPayload(): TemplatePayload {
  const target = document.createElement("div");
  target.id = "front";
  document.body.appendChild(target);
  const cardText = DEV_SAMPLE_CARD_TEXT;
  const cardPayload: CardPayload = parseCardPayloadJson(
    DEV_SAMPLE_CARD_PAYLOAD_JSON,
  );

  return {
    target,
    cardText,
    wordByWord: cardPayload.wordByWord,
    ngramTranslations: cardPayload.ngramTranslations,
    audioMetadata: cardPayload.audioMetadata,
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
    audioMetadata: payload.audioMetadata,
  },
});

payload.target.classList.remove("card-template-loading");
