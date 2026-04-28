import { mount, unmount, type ComponentProps } from "svelte";
import App from "./App.svelte";
import "./index.css";
import {
  DEV_SAMPLE_CARD_PAYLOAD_JSON,
  DEV_SAMPLE_CARD_TEXT,
} from "./devSample";
import {
  parseCardPayloadJson,
  type CardPayload,
} from "../../deck-cli/src/contracts/cardPayload";

type AppProps = ComponentProps<typeof App>;

type TemplatePayload = AppProps & {
  target: HTMLElement;
};

type AnkiWindow = Window & {
  __cleanUp?: () => void;
  ankiListenersInstalled?: boolean;
  playCurrentCardAudio?: () => void;
};

const DEFAULT_AUTOPLAY = true;
const DEFAULT_REPLAY_KEYBIND = "r";

const getLastMatch = <T extends Element>(selector: string): T | null => {
  const matches = document.querySelectorAll<T>(selector);
  return matches[matches.length - 1] ?? null;
};

const parseBoolean = (rawValue: string | null, fallback: boolean): boolean => {
  if (rawValue === null) return fallback;
  const normalized = rawValue.trim().toLowerCase();
  if (normalized.length === 0) return true;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const parseReplayKeybind = (rawValue: string | null): string | null => {
  if (rawValue === null) return DEFAULT_REPLAY_KEYBIND;
  const normalized = rawValue.trim();
  if (normalized.length === 0) return null;
  return ["none", "off", "false"].includes(normalized.toLowerCase())
    ? null
    : normalized;
};

const readCardConfig = (
  configElement: Element | null,
): {
  autoplay: boolean;
  replayKeybind: string | null;
} => {
  return {
    autoplay: parseBoolean(
      configElement?.getAttribute("autoplay") ?? null,
      DEFAULT_AUTOPLAY,
    ),
    replayKeybind: parseReplayKeybind(
      configElement?.getAttribute("replaykeybind") ??
        configElement?.getAttribute("replay-keybind") ??
        configElement?.getAttribute("replayKeybind") ??
        null,
    ),
  };
};

const decodeHtmlEntities = (value: string): string => {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
};

const hasMeaningfulPayload = (payload: CardPayload): boolean => {
  return (
    Object.keys(payload.wordByWord).length > 0 ||
    payload.ngramTranslations.length > 0 ||
    payload.audioMetadata !== null
  );
};

const parseTemplateCardPayload = (rawPayload: string): CardPayload => {
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
};

const createAppProps = (
  cardText: string,
  cardPayload: CardPayload,
  config: ReturnType<typeof readCardConfig>,
): AppProps => {
  return {
    cardText,
    wordByWord: cardPayload.wordByWord,
    ngramTranslations: cardPayload.ngramTranslations,
    audioMetadata: cardPayload.audioMetadata,
    autoplay: config.autoplay,
    replayKeybind: config.replayKeybind,
  };
};

const readTemplatePayload = (): TemplatePayload | null => {
  const frontElement = getLastMatch<HTMLElement>(
    "#front.card-template-loading",
  );
  if (!frontElement) return null;

  const cardPayloadElement =
    (frontElement.nextElementSibling instanceof HTMLElement &&
    frontElement.nextElementSibling.id === "cardPayload"
      ? frontElement.nextElementSibling
      : null) ?? getLastMatch<HTMLElement>("#cardPayload");

  if (!cardPayloadElement) return null;

  const cardConfigElement =
    (cardPayloadElement.nextElementSibling instanceof Element &&
    cardPayloadElement.nextElementSibling.tagName.toLowerCase() ===
      "card-config"
      ? cardPayloadElement.nextElementSibling
      : null) ?? getLastMatch<Element>("card-config");

  const cardPayload = parseTemplateCardPayload(
    cardPayloadElement.textContent ?? "",
  );
  const config = readCardConfig(cardConfigElement);
  const cardText = frontElement.textContent ?? "";

  frontElement.textContent = "";

  return {
    target: frontElement,
    ...createAppProps(cardText, cardPayload, config),
  };
};

const readDevelopmentPayload = (): TemplatePayload => {
  const target = document.createElement("div");
  target.id = "front";
  document.body.appendChild(target);

  const cardPayload = parseCardPayloadJson(DEV_SAMPLE_CARD_PAYLOAD_JSON);
  const config = readCardConfig(getLastMatch<Element>("card-config"));

  return {
    target,
    ...createAppProps(DEV_SAMPLE_CARD_TEXT, cardPayload, config),
  };
};

const isEditableKeyboardTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  const cssSelector = "input, textarea, select, [contenteditable='true']";
  return target.closest(cssSelector) !== null;
};

const getCurrentAudioElement = (): HTMLAudioElement | null => {
  const audioElements =
    document.querySelectorAll<HTMLAudioElement>("#front audio");
  const audioElArr = Array.from(audioElements);
  audioElArr.filter((e) => e.isConnected && e.getClientRects().length > 0);
  if (audioElArr.length == 0) return null;
  return audioElArr[0];
};

const installGlobalEventListeners = (window: AnkiWindow): void => {
  if (window.ankiListenersInstalled) return;

  window.playCurrentCardAudio = () => {
    const audioElement = getCurrentAudioElement();
    if (!audioElement) return;
    audioElement.pause();
    audioElement.currentTime = 0;
    audioElement.play().catch(() => {});
  };

  document.addEventListener(
    "keyup",
    (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (isEditableKeyboardTarget(event.target)) return;

      const replayKeybind = readCardConfig(
        getLastMatch<Element>("card-config"),
      ).replayKeybind?.toLowerCase();

      if (!replayKeybind || event.key.trim().toLowerCase() !== replayKeybind)
        return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      window.playCurrentCardAudio?.();
    },
    true,
  );
  window.ankiListenersInstalled = true;
};

const mountApp = (payload: TemplatePayload) => {
  ankiWindow.__cleanUp?.();
  const { target, ...props } = payload;
  const app = mount(App, { target, props });
  ankiWindow.__cleanUp = () => {
    unmount(app);
    delete ankiWindow.__cleanUp;
  };
  target.style.visibility = "";
  target.classList.remove("card-template-loading");
};

const ankiWindow = window as AnkiWindow;
installGlobalEventListeners(ankiWindow);

const payload =
  readTemplatePayload() ??
  (import.meta.env.DEV ? readDevelopmentPayload() : null);

if (payload) mountApp(payload);
