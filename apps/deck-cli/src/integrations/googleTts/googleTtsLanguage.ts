import type { LanguageCode } from "../tatoeba/index";

const GOOGLE_TTS_LANGUAGE_BY_TATOEBA: Record<string, string> = {
  eng: "en-US",
  hun: "hu-HU",
  spa: "es-ES",
  deu: "de-DE",
  fra: "fr-FR",
  ita: "it-IT",
  por: "pt-PT",
  nld: "nl-NL",
  swe: "sv-SE",
  nor: "nb-NO",
  dan: "da-DK",
  fin: "fi-FI",
  pol: "pl-PL",
  ces: "cs-CZ",
  slk: "sk-SK",
  slv: "sl-SI",
  hrv: "hr-HR",
  ron: "ro-RO",
  bul: "bg-BG",
  ell: "el-GR",
  rus: "ru-RU",
  ukr: "uk-UA",
  tur: "tr-TR",
  ara: "ar-XA",
  heb: "he-IL",
  hin: "hi-IN",
  ben: "bn-IN",
  tam: "ta-IN",
  tel: "te-IN",
  jpn: "ja-JP",
  kor: "ko-KR",
  zho: "cmn-CN",
  ind: "id-ID",
  vie: "vi-VN",
  tha: "th-TH",
};

export function resolveGoogleTtsLanguageCode(
  sentenceLanguage: LanguageCode,
): string | undefined {
  return GOOGLE_TTS_LANGUAGE_BY_TATOEBA[sentenceLanguage];
}
