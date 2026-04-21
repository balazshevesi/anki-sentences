# Tatoeba sentence search wrapper

This package contains a typed wrapper for `GET /v1/sentences` from the Tatoeba API.

## Install dependencies

```bash
bun install
```

## Run tests

```bash
bun test
```

## Refresh supported languages

```bash
bun run update:languages
```

This updates `tatoebaLanguages.ts` from the language list on `https://tatoeba.org/en/downloads`.

## Usage

```ts
import { searchSentences } from "./index";

const response = await searchSentences({
  lang: ["eng", "deu"],
  sort: "relevance",
  q: "hello",
  limit: 10,
  "trans:lang": "spa",
});

console.log(response.data[0]);
console.log(response.paging.next);
```

### Supported language types

```ts
import {
  isSupportedLanguageCode,
  SUPPORTED_LANGUAGE_CODES,
  SUPPORTED_LANGUAGES,
  type SupportedLanguageCode,
} from "./index";

const code: SupportedLanguageCode = "eng";
console.log(SUPPORTED_LANGUAGES[code]); // English
console.log(SUPPORTED_LANGUAGE_CODES.length); // currently 429

if (isSupportedLanguageCode("deu")) {
  // narrows to SupportedLanguageCode
}
```

### Pagination helper

```ts
import { getAfterCursorFromPaging, searchSentences } from "./index";

const firstPage = await searchSentences({
  lang: "eng",
  sort: "random",
  limit: 20,
});

const after = getAfterCursorFromPaging(firstPage.paging);
if (after) {
  const nextPage = await searchSentences({
    lang: "eng",
    sort: "random",
    limit: 20,
    after,
  });

  console.log(nextPage.data.length);
}
```

### Advanced grouped translation filters

Use `extraParams` for dynamic keys such as `trans:1:lang` and `!trans:2:lang`.

```ts
import { searchSentences } from "./index";

const response = await searchSentences({
  lang: "eng",
  sort: "relevance",
  extraParams: {
    "trans:1:lang": "deu",
    "trans:2:lang": "spa",
    "!trans:lang": "jpn",
  },
});

console.log(response.data.length);
```
