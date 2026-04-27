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

type CardTemplateWindow = Window & {
  __cardTemplateTeardown?: () => void;
  __cardTemplateActiveInstanceId?: string;
  __cardTemplateObserver?: MutationObserver;
  __cardTemplateHydrationScheduled?: boolean;
  __cardTemplateReplayListenerInstalled?: boolean;
  playCurrentCardAudio?: () => void;
};

function generateCardTemplateInstanceId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type TemplateDomContext = {
  frontElement: HTMLElement | null;
  cardPayloadElement: HTMLElement | null;
  cardConfigElement: Element | null;
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

function getLastElementById(id: string): HTMLElement | null {
  const matches = document.querySelectorAll<HTMLElement>(`#${id}`);
  if (matches.length === 0) {
    return null;
  }

  return matches[matches.length - 1] ?? null;
}

function getLastElementByTagName(tagName: string): Element | null {
  const matches = document.querySelectorAll(tagName);
  if (matches.length === 0) {
    return null;
  }

  return matches[matches.length - 1] ?? null;
}

function findPreviousSiblingElement(
  startElement: Element,
  matcher: (element: Element) => boolean,
): Element | null {
  let currentElement = startElement.previousElementSibling;
  while (currentElement) {
    if (matcher(currentElement)) {
      return currentElement;
    }

    currentElement = currentElement.previousElementSibling;
  }

  return null;
}

function readTemplateDomContextFromCurrentScript(): TemplateDomContext {
  const currentScript = document.currentScript;
  if (!(currentScript instanceof HTMLScriptElement)) {
    return {
      frontElement: null,
      cardPayloadElement: null,
      cardConfigElement: null,
    };
  }

  const frontElement = findPreviousSiblingElement(
    currentScript,
    (element) => element instanceof HTMLElement && element.id === "front",
  );
  const cardPayloadElement = findPreviousSiblingElement(
    currentScript,
    (element) =>
      element instanceof HTMLElement && element.id === "cardPayload",
  );
  const cardConfigElement = findPreviousSiblingElement(
    currentScript,
    (element) => element.tagName.toLowerCase() === "card-config",
  );

  return {
    frontElement: frontElement instanceof HTMLElement ? frontElement : null,
    cardPayloadElement:
      cardPayloadElement instanceof HTMLElement ? cardPayloadElement : null,
    cardConfigElement,
  };
}

function findPendingFrontElement(): HTMLElement | null {
  return document.querySelector<HTMLElement>("#front.card-template-loading");
}

function getCardPayloadElementForFront(frontElement: HTMLElement): HTMLElement | null {
  const nextSibling = frontElement.nextElementSibling;
  if (
    nextSibling instanceof HTMLElement &&
    nextSibling.id === "cardPayload"
  ) {
    return nextSibling;
  }

  return null;
}

function markActiveFrontElement(frontElement: HTMLElement): void {
  const allFrontElements = document.querySelectorAll<HTMLElement>("#front");
  for (const element of allFrontElements) {
    element.removeAttribute("data-card-template-active");
  }

  frontElement.setAttribute("data-card-template-active", "true");
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

function readCardConfig(
  configElementOverride: Element | null = null,
): { autoplay: boolean; replayKeybind: string | null } {
  const configElement =
    configElementOverride ?? getLastElementByTagName("card-config");
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

function normalizeReplayKeybindForMatch(value: string | null): string | null {
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
  const domContext = readTemplateDomContextFromCurrentScript();
  const frontElement =
    domContext.frontElement ??
    findPendingFrontElement() ??
    getLastElementById("front");
  const cardPayloadElement =
    domContext.cardPayloadElement ??
    (frontElement ? getCardPayloadElementForFront(frontElement) : null) ??
    getLastElementById("cardPayload");

  if (!frontElement || !cardPayloadElement) {
    return null;
  }

  markActiveFrontElement(frontElement);

  const cardText = frontElement.textContent ?? "";
  const cardPayload: CardPayload = parseTemplateCardPayload(
    cardPayloadElement.textContent ?? "",
  );
  const cardConfig = readCardConfig(domContext.cardConfigElement);

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

const cardTemplateWindow = window as CardTemplateWindow;
cardTemplateWindow.__cardTemplateObserver?.disconnect();

function getActiveAudioElement(): HTMLAudioElement | null {
  const isLikelyVisible = (element: HTMLElement): boolean =>
    element.isConnected && element.getClientRects().length > 0;

  const activeInstanceId = cardTemplateWindow.__cardTemplateActiveInstanceId;
  if (activeInstanceId) {
    const activeAudio = document.querySelector<HTMLAudioElement>(
      `audio[data-card-template-instance-id="${activeInstanceId}"]`,
    );

    if (activeAudio && isLikelyVisible(activeAudio)) {
      return activeAudio;
    }
  }

  const frontAudios = document.querySelectorAll<HTMLAudioElement>("#front audio");
  if (frontAudios.length === 0) {
    return null;
  }

  for (let index = frontAudios.length - 1; index >= 0; index -= 1) {
    const candidate = frontAudios[index];
    if (candidate && isLikelyVisible(candidate)) {
      return candidate;
    }
  }

  return frontAudios[frontAudios.length - 1] ?? null;
}

function installGlobalReplayListener(): void {
  if (cardTemplateWindow.__cardTemplateReplayListenerInstalled) {
    return;
  }

  cardTemplateWindow.playCurrentCardAudio = () => {
    const activeAudio = getActiveAudioElement();
    if (!activeAudio) {
      return;
    }

    activeAudio.pause();
    activeAudio.currentTime = 0;

    const playPromise = activeAudio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      void playPromise.catch(() => {});
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

      const replayKeybind = normalizeReplayKeybindForMatch(
        readCardConfig().replayKeybind,
      );
      if (!replayKeybind) {
        return;
      }

      if (event.key.trim().toLowerCase() !== replayKeybind) {
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

function mountPayload(payload: TemplatePayload): void {
  cardTemplateWindow.__cardTemplateTeardown?.();

  const instanceId = generateCardTemplateInstanceId();
  cardTemplateWindow.__cardTemplateActiveInstanceId = instanceId;

  const app = mount(App, {
    target: payload.target,
    props: {
      cardText: payload.cardText,
      wordByWord: payload.wordByWord,
      ngramTranslations: payload.ngramTranslations,
      audioMetadata: payload.audioMetadata,
      autoplay: payload.autoplay,
      replayKeybind: payload.replayKeybind,
      instanceId,
    },
  });

  cardTemplateWindow.__cardTemplateTeardown = () => {
    if (cardTemplateWindow.__cardTemplateActiveInstanceId === instanceId) {
      delete cardTemplateWindow.__cardTemplateActiveInstanceId;
    }
    unmount(app);
    delete cardTemplateWindow.__cardTemplateTeardown;
  };

  payload.target.classList.remove("card-template-loading");
}

function hydrateLatestTemplate(): void {
  const payload =
    readTemplatePayload() ??
    (import.meta.env.DEV ? readDevelopmentPayload() : null);

  if (!payload) {
    return;
  }

  mountPayload(payload);
}

function scheduleHydration(): void {
  if (cardTemplateWindow.__cardTemplateHydrationScheduled) {
    return;
  }

  cardTemplateWindow.__cardTemplateHydrationScheduled = true;
  setTimeout(() => {
    cardTemplateWindow.__cardTemplateHydrationScheduled = false;
    hydrateLatestTemplate();
  }, 0);
}

installGlobalReplayListener();
hydrateLatestTemplate();

const observer = new MutationObserver(() => {
  if (document.querySelector("#front.card-template-loading")) {
    scheduleHydration();
  }
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

cardTemplateWindow.__cardTemplateObserver = observer;
