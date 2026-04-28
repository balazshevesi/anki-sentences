import type { Plugin } from "vite";

/** Options for generating the pasteable Anki front-template HTML. */
export type AnkiPasteableTemplatePluginOptions = {
  /** Anki note field used as the sentence shown on the front side. */
  sentenceField?: string;
  /** Anki note field containing the JSON payload consumed by the card UI. */
  cardPayloadField?: string;
  /** Whether the card audio should try to play automatically on the front side. */
  autoplay?: boolean;
  /** Keyboard key used to replay audio. Set to null to disable the keybind. */
  replayKeybind?: string | null;
};

type ResolvedAnkiPasteableTemplatePluginOptions = {
  sentenceField: string;
  cardPayloadField: string;
  autoplay: boolean;
  replayKeybind: string | null;
};

const DEFAULT_OPTIONS = {
  sentenceField: "Sentence",
  cardPayloadField: "cardPayload",
  autoplay: true,
  replayKeybind: "r",
} satisfies ResolvedAnkiPasteableTemplatePluginOptions;

const ANKI_COMPAT_POLYFILLS = `<script>(function(){if(typeof globalThis==="undefined"){Object.defineProperty(Object.prototype,"__globalThis__",{get:function(){return this},configurable:true});__globalThis__.globalThis=__globalThis__;delete Object.prototype.__globalThis__;}if(!Object.fromEntries){Object.fromEntries=function(iterable){if(iterable==null){throw new TypeError("Cannot convert undefined or null to object")}var obj={};if(Array.isArray(iterable)){for(var i=0;i<iterable.length;i+=1){var arrayItem=iterable[i];if(!arrayItem||arrayItem.length<2){throw new TypeError("Iterator value "+arrayItem+" is not an entry object")}obj[arrayItem[0]]=arrayItem[1];}return obj;}var iterator=iterable[typeof Symbol!="undefined"&&Symbol.iterator?Symbol.iterator:"@@iterator"];if(typeof iterator!="function"){throw new TypeError("Object is not iterable")}var stepIterator=iterator.call(iterable);for(var step=stepIterator.next();!step.done;step=stepIterator.next()){var item=step.value;if(!item||item.length<2){throw new TypeError("Iterator value "+item+" is not an entry object")}obj[item[0]]=item[1];}return obj;};}if(!Array.prototype.at){Array.prototype.at=function(index){var length=this.length>>>0;var relativeIndex=Number(index)||0;var normalizedIndex=relativeIndex>=0?relativeIndex:length+relativeIndex;if(normalizedIndex<0||normalizedIndex>=length){return undefined;}return this[normalizedIndex];};}if(!String.prototype.replaceAll){String.prototype.replaceAll=function(searchValue,replaceValue){if(searchValue instanceof RegExp){if(!searchValue.global){throw new TypeError("String.prototype.replaceAll called with a non-global RegExp argument")}return this.replace(searchValue,replaceValue);}return this.split(String(searchValue)).join(String(replaceValue));};}})();</script>`;

function resolveOptions(
  options: AnkiPasteableTemplatePluginOptions,
): ResolvedAnkiPasteableTemplatePluginOptions {
  return {
    sentenceField: options.sentenceField ?? DEFAULT_OPTIONS.sentenceField,
    cardPayloadField:
      options.cardPayloadField ?? DEFAULT_OPTIONS.cardPayloadField,
    autoplay: options.autoplay ?? DEFAULT_OPTIONS.autoplay,
    replayKeybind:
      options.replayKeybind !== undefined
        ? options.replayKeybind
        : DEFAULT_OPTIONS.replayKeybind,
  };
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderAnkiField(fieldName: string): string {
  return `{{${fieldName}}}`;
}

function renderAnkiScaffold(
  options: ResolvedAnkiPasteableTemplatePluginOptions,
): string {
  const replayKeybind = options.replayKeybind ?? "";

  return `<div id="front" class="card-template-loading" style="visibility: hidden">${renderAnkiField(options.sentenceField)}</div>
<div id="cardPayload" hidden>${renderAnkiField(options.cardPayloadField)}</div>
<card-config hidden autoplay="${String(options.autoplay)}" replaykeybind="${escapeHtmlAttribute(replayKeybind)}"></card-config>`;
}

function injectAnkiScaffold(html: string, scaffold: string): string {
  if (html.includes('id="front"') && html.includes('id="cardPayload"')) {
    return html;
  }

  const injection = `${scaffold}\n${ANKI_COMPAT_POLYFILLS}\n`;
  const firstScriptMatch = html.match(/<script\b/i);

  if (firstScriptMatch?.index === undefined) {
    return `${html.trimEnd()}\n${injection}`;
  }

  return `${html.slice(0, firstScriptMatch.index)}${injection}${html.slice(firstScriptMatch.index)}`;
}

function toClassicScriptTagAttributes(attributes: string): string {
  return attributes
    .replace(/\s+type=("module"|'module')/gi, "")
    .replace(/\s+crossorigin(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?/gi, "")
    .trim();
}

function downgradeModuleScriptsForAnki(html: string): string {
  return html.replace(/<script\b([^>]*)>/gi, (_match, rawAttributes) => {
    const attributes =
      typeof rawAttributes === "string"
        ? toClassicScriptTagAttributes(rawAttributes)
        : "";

    return attributes.length > 0 ? `<script ${attributes}>` : "<script>";
  });
}

function neutralizeAnkiMustacheInInlineScripts(html: string): string {
  return html.replace(
    /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi,
    (_match, openTag, scriptContent, closeTag) =>
      `${openTag}${String(scriptContent).replaceAll("{{", "{ {")}${closeTag}`,
  );
}

/**
 * Converts the single-file Vite build into an Anki-ready template users can
 * copy from dist/index.html into an existing note type.
 */
export function ankiPasteableTemplatePlugin(
  options: AnkiPasteableTemplatePluginOptions = {},
): Plugin {
  const scaffold = renderAnkiScaffold(resolveOptions(options));

  return {
    name: "anki-pasteable-template",
    apply: "build",
    enforce: "post",
    generateBundle: (_options, bundle) => {
      for (const asset of Object.values(bundle)) {
        if (
          asset.type !== "asset" ||
          asset.fileName !== "index.html" ||
          typeof asset.source !== "string"
        ) {
          continue;
        }

        asset.source = neutralizeAnkiMustacheInInlineScripts(
          downgradeModuleScriptsForAnki(
            injectAnkiScaffold(asset.source, scaffold),
          ),
        );
      }
    },
  };
}
