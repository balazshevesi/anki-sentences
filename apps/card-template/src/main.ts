import { mount, unmount } from "svelte";
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

type AppPayload = {
  cardText: string;
  wordByWord: Record<string, WordTranslation>;
  ngramTranslations: NgramTranslation[];
  audioMetadata: AudioMetadata | null;
  autoplay: boolean;
  replayKeybind: string | null;
};

type TemplatePayload = AppPayload & {
  target: HTMLElement;
};

type CardTemplateWindow = Window & {
  __cardTemplateTeardown?: () => void;
  __cardTemplateReplayListenerInstalled?: boolean;
  playCurrentCardAudio?: () => void;
};

const DEFAULT_AUTOPLAY = false;
const DEFAULT_REPLAY_KEYBIND = "r";

function getLastMatch<T extends Element>(selector: string): T | null {
  const matches = document.querySelectorAll<T>(selector);
  return matches[matches.length - 1] ?? null;
}

function parseBooleanAttribute(rawValue: string | null, fallback: boolean): boolean {
  if (rawValue === null) {
    return fallback;
  }

  const normalized = rawValue.trim().toLowerCase();
  if (normalized.length === 0) {
    return true;
  }

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parseReplayKeybindAttribute(rawValue: string | null): string | null {
  if (rawValue === null) {
    return DEFAULT_REPLAY_KEYBIND;
  }

  const normalized = rawValue.trim();
  if (normalized.length === 0) {
    return null;
  }

  return ["none", "off", "false"].includes(normalized.toLowerCase())
    ? null
    : normalized;
}

function readCardConfig(configElement: Element | null): {
  autoplay: boolean;
  replayKeybind: string | null;
} {
  const getAttribute = (attributeNames: string[]): string | null => {
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
  };

  return {
    autoplay: parseBooleanAttribute(getAttribute(["autoplay"]), DEFAULT_AUTOPLAY),
    replayKeybind: parseReplayKeybindAttribute(
      getAttribute(["replaykeybind", "replay-keybind", "replayKeybind"]),
    ),
  };
}

function decodeHtmlEntities(value: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function hasMeaningfulPayload(payload: CardPayload): boolean {
  return (
    Object.keys(payload.wordByWord).length > 0 ||
    payload.ngramTranslations.length > 0 ||
    payload.audioMetadata !== null
  );
}

function parseTemplateCardPayload(rawPayload: string): CardPayload {
  const parsedPayload = parseCardPayloadJson(rawPayload);
  if (
    hasMeaningfulPayload(parsedPayload) ||
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
  return hasMeaningfulPayload(decodedParsedPayload)
    ? decodedParsedPayload
    : parsedPayload;
}

function readTemplatePayload(): TemplatePayload | null {
  const frontElement = getLastMatch<HTMLElement>("#front.card-template-loading");
  if (!frontElement) {
    return null;
  }

  const cardPayloadElement =
    (frontElement.nextElementSibling instanceof HTMLElement &&
    frontElement.nextElementSibling.id === "cardPayload"
      ? frontElement.nextElementSibling
      : null) ?? getLastMatch<HTMLElement>("#cardPayload");

  if (!cardPayloadElement) {
    return null;
  }

  const cardConfigElement =
    (cardPayloadElement.nextElementSibling instanceof Element &&
    cardPayloadElement.nextElementSibling.tagName.toLowerCase() === "card-config"
      ? cardPayloadElement.nextElementSibling
      : null) ?? getLastMatch<Element>("card-config");

  const cardPayload = parseTemplateCardPayload(cardPayloadElement.textContent ?? "");
  const config = readCardConfig(cardConfigElement);
  const cardText = frontElement.textContent ?? "";

  frontElement.textContent = "";

  return {
    target: frontElement,
    cardText,
    wordByWord: cardPayload.wordByWord,
    ngramTranslations: cardPayload.ngramTranslations,
    audioMetadata: cardPayload.audioMetadata,
    autoplay: config.autoplay,
    replayKeybind: config.replayKeybind,
  };
}

function readDevelopmentPayload(): TemplatePayload {
  const target = document.createElement("div");
  target.id = "front";
  document.body.appendChild(target);

  const cardPayload = parseCardPayloadJson(DEV_SAMPLE_CARD_PAYLOAD_JSON);
  const config = readCardConfig(getLastMatch<Element>("card-config"));

  return {
    target,
    cardText: DEV_SAMPLE_CARD_TEXT,
    wordByWord: cardPayload.wordByWord,
    ngramTranslations: cardPayload.ngramTranslations,
    audioMetadata: cardPayload.audioMetadata,
    autoplay: config.autoplay,
    replayKeybind: config.replayKeybind,
  };
}

function normalizeReplayKeybind(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  if (target instanceof HTMLElement && target.isContentEditable) {
    return true;
  }

  return target.closest("input, textarea, select, [contenteditable='true']") !== null;
}

function getCurrentAudioElement(): HTMLAudioElement | null {
  const audioElements = document.querySelectorAll<HTMLAudioElement>("#front audio");
  for (let index = audioElements.length - 1; index >= 0; index -= 1) {
    const audioElement = audioElements[index];
    if (audioElement && audioElement.isConnected && audioElement.getClientRects().length > 0) {
      return audioElement;
    }
  }

  return audioElements[audioElements.length - 1] ?? null;
}

function installGlobalReplayListener(cardTemplateWindow: CardTemplateWindow): void {
  if (cardTemplateWindow.__cardTemplateReplayListenerInstalled) {
    return;
  }

  cardTemplateWindow.playCurrentCardAudio = () => {
    const audioElement = getCurrentAudioElement();
    if (!audioElement) {
      return;
    }

    audioElement.pause();
    audioElement.currentTime = 0;
    const playbackPromise = audioElement.play();
    if (playbackPromise && typeof playbackPromise.catch === "function") {
      void playbackPromise.catch(() => {});
    }
  };

  document.addEventListener(
    "keyup",
    (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      const replayKeybind = normalizeReplayKeybind(
        readCardConfig(getLastMatch<Element>("card-config")).replayKeybind,
      );

      if (!replayKeybind || event.key.trim().toLowerCase() !== replayKeybind) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      cardTemplateWindow.playCurrentCardAudio?.();
    },
    true,
  );

  cardTemplateWindow.__cardTemplateReplayListenerInstalled = true;
}

const cardTemplateWindow = window as CardTemplateWindow;
installGlobalReplayListener(cardTemplateWindow);

const payload =
  readTemplatePayload() ??
  (import.meta.env.DEV ? readDevelopmentPayload() : null);

if (payload) {
  cardTemplateWindow.__cardTemplateTeardown?.();

  const app = mount(App, {
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

  cardTemplateWindow.__cardTemplateTeardown = () => {
    unmount(app);
    delete cardTemplateWindow.__cardTemplateTeardown;
  };

  payload.target.classList.remove("card-template-loading");
}
