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
  autoplay: boolean;
  replayKeybind: string | null;
};

type TemplatePayload = AppCardPayload & {
  target: HTMLElement;
};

const DEFAULT_AUTOPLAY = false;
const DEFAULT_REPLAY_KEYBIND = "r";

function getCardConfigAttributeValue(
  configElement: Element | null,
  attributeNames: string[],
): string | null {
  if (!configElement) {
    return null;
  }

  for (const attributeName of attributeNames) {
    const value = configElement.getAttribute(attributeName);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function parseCardConfigBooleanAttribute(
  rawValue: string | null,
  fallback: boolean,
): boolean {
  if (rawValue === null) {
    return fallback;
  }

  const normalizedValue = rawValue.trim().toLowerCase();
  if (normalizedValue.length === 0) {
    return true;
  }

  if (["1", "true", "yes", "on"].includes(normalizedValue)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalizedValue)) {
    return false;
  }

  return fallback;
}

function parseCardConfigReplayKeybindAttribute(
  rawValue: string | null,
): string | null {
  if (rawValue === null) {
    return DEFAULT_REPLAY_KEYBIND;
  }

  const normalizedValue = rawValue.trim();
  if (normalizedValue.length === 0) {
    return null;
  }

  if (["none", "off", "false"].includes(normalizedValue.toLowerCase())) {
    return null;
  }

  return normalizedValue;
}

function readCardConfig(): { autoplay: boolean; replayKeybind: string | null } {
  const configElement = document.querySelector("card-config");
  const rawAutoplay = getCardConfigAttributeValue(configElement, ["autoplay"]);
  const rawReplayKeybind = getCardConfigAttributeValue(configElement, [
    "replaykeybind",
    "replay-keybind",
    "replayKeybind",
  ]);

  return {
    autoplay: parseCardConfigBooleanAttribute(rawAutoplay, DEFAULT_AUTOPLAY),
    replayKeybind: parseCardConfigReplayKeybindAttribute(rawReplayKeybind),
  };
}

function hasMeaningfulCardPayload(payload: CardPayload): boolean {
  return (
    Object.keys(payload.wordByWord).length > 0 ||
    payload.ngramTranslations.length > 0 ||
    payload.audioMetadata !== null
  );
}

function decodeHtmlEntities(value: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function parseTemplateCardPayload(rawPayload: string): CardPayload {
  const parsedPayload = parseCardPayloadJson(rawPayload);
  if (
    hasMeaningfulCardPayload(parsedPayload) ||
    rawPayload.trim().length === 0 ||
    !rawPayload.includes("&")
  ) {
    return parsedPayload;
  }

  const decodedPayload = decodeHtmlEntities(rawPayload);
  if (decodedPayload === rawPayload) {
    return parsedPayload;
  }

  const decodedParsedPayload = parseCardPayloadJson(decodedPayload);
  return hasMeaningfulCardPayload(decodedParsedPayload)
    ? decodedParsedPayload
    : parsedPayload;
}

function readTemplatePayload(): TemplatePayload | null {
  const frontElement = document.getElementById("front");
  const cardPayloadElement = document.getElementById("cardPayload");

  if (!frontElement || !cardPayloadElement) {
    return null;
  }

  const cardText = frontElement.textContent ?? "";
  const cardPayload: CardPayload = parseTemplateCardPayload(
    cardPayloadElement.textContent ?? "",
  );
  const cardConfig = readCardConfig();

  frontElement.textContent = "";

  return {
    target: frontElement,
    cardText,
    wordByWord: cardPayload.wordByWord,
    ngramTranslations: cardPayload.ngramTranslations,
    audioMetadata: cardPayload.audioMetadata,
    autoplay: cardConfig.autoplay,
    replayKeybind: cardConfig.replayKeybind,
  };
}

function readDevelopmentPayload(): TemplatePayload {
  const target = document.createElement("div");
  target.id = "front";
  document.body.appendChild(target);
  const cardConfig = readCardConfig();
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
    autoplay: cardConfig.autoplay,
    replayKeybind: cardConfig.replayKeybind,
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
    autoplay: payload.autoplay,
    replayKeybind: payload.replayKeybind,
  },
});

payload.target.classList.remove("card-template-loading");
