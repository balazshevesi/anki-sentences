# Anki Language Sentence Study Decks

A toolkit for building sentence-based [Anki](https://apps.ankiweb.net/) decks from [Tatoeba](https://tatoeba.org/en/) data.

The project takes a list of target words, or the top N words from a frequency list, finds useful example sentences, enriches each card with translations, difficulty metadata, and Google Text-to-Speech audio, then exports a ready-to-import `.apkg` file.

This repository is built around one config-driven pipeline.

## What It Builds

Each generated deck can include:

- Source-language example sentences from [Tatoeba](https://tatoeba.org/en/)
- Sentence translations from [Tatoeba](https://tatoeba.org/en/)
- Word-by-word and n-gram translation hints from [Argos Translate](https://github.com/argosopentech/argos-translate) or Google Translate
- Difficulty scores based on local frequency data
- Google Text-to-Speech audio files and [Anki](https://apps.ankiweb.net/) `[sound:...]` tags
- Word-level audio timestamp metadata for the card UI
- A bundled [Svelte](https://svelte.dev/) [Anki](https://apps.ankiweb.net/) card template
- A final `.apkg` package that can be imported into [Anki](https://apps.ankiweb.net/)

## Requirements

Use the [Nix](https://nixos.org/) shell to install required packages:

```bash
nix develop
```

## Quick Start

Edit [`apps/deck-cli/deck.config.jsonc`](./apps/deck-cli/deck.config.jsonc), then run:

```bash
cd apps/deck-cli
bun run build
```

By default, generated files are written under `output/` from paths configured in [`apps/deck-cli/deck.config.jsonc`](./apps/deck-cli/deck.config.jsonc).

## Configuration

The pipeline is controlled by [`apps/deck-cli/deck.config.jsonc`](./apps/deck-cli/deck.config.jsonc).

The checked-in config references [`apps/deck-cli/deck.config.schema.json`](./apps/deck-cli/deck.config.schema.json), so editors with JSON Schema support should provide validation and completion.

To run with another config file:

```bash
DECK_CONFIG_PATH=/absolute/or/relative/path.jsonc bun run src/index.ts
```

The default CLI entrypoint is [`apps/deck-cli/src/index.ts`](./apps/deck-cli/src/index.ts).

## Pipeline Passes

Available pass names:

- `retrieve` - fetch matching [Tatoeba](https://tatoeba.org/en/) sentence rows into the CSV
- `enrich-translations` - add word and n-gram translation metadata
- `enrich-translation-alternatives` - fill missing translation alternatives where available
- `enrich-difficulty` - score and sort cards by difficulty
- `enrich-audio` - generate Google TTS audio and timestamp metadata
- `build-apkg` - build the [Anki](https://apps.ankiweb.net/) package

You can remove passes from [`apps/deck-cli/deck.config.jsonc`](./apps/deck-cli/deck.config.jsonc) when iterating on a specific stage. For example, after retrieving sentences once, you can rerun only enrichment or packaging passes against the existing CSV.

## Translation Providers

### [Argos Translate](https://github.com/argosopentech/argos-translate)

[Argos Translate](https://github.com/argosopentech/argos-translate) runs locally through the FastAPI service in [`apps/argos-translate-service/`](./apps/argos-translate-service/).

Start it from the deck CLI directory:

```bash
cd apps/deck-cli
bun run argos:start
```

Then set:

```jsonc
"translation": {
  "provider": "argos",
  "sourceLanguage": "de",
  "targetLanguage": "en",
  "argos": {
    "translateUrl": "http://127.0.0.1:8000/translate",
    "cachePath": "../../output/argos-translate-cache.json",
    "alternatives": 2
  }
}
```

The service host and port can be overridden with:

```dotenv
ARGOS_HOST=127.0.0.1
ARGOS_PORT=8000
```

### Google Translate

Google Translate uses either an API key, an access token, or local Application Default Credentials.

Set the provider to `google`:

```jsonc
"translation": {
  "provider": "google",
  "sourceLanguage": "de",
  "targetLanguage": "en",
  "argos": {
    "translateUrl": "http://127.0.0.1:8000/translate",
    "cachePath": "../../output/argos-translate-cache.json",
    "alternatives": 2
  },
  "google": {
    "translateUrl": "https://translation.googleapis.com/language/translate/v2",
    "cachePath": "../../output/google-translate-cache.json",
    "accessToken": null,
    "apiKey": null,
    "quotaProject": null
  }
}
```

## Google Text-to-Speech

The audio pass uses Google Cloud Text-to-Speech and requires OAuth2 credentials. API keys are not supported for this endpoint.

For local development, use Application Default Credentials:

```bash
gcloud auth application-default login
```

Make sure the relevant APIs are enabled in your Google Cloud project:

- Cloud Text-to-Speech API
- Cloud Translation API, if using Google Translate

`ffmpeg` must be available on `PATH`; the CLI transcodes generated speech to AAC before packaging it into [Anki](https://apps.ankiweb.net/).

## Card Template

The card UI lives in [`apps/card-template/`](./apps/card-template/) and is bundled into a single HTML artifact:

```bash
cd apps/deck-cli
bun run template:build
```

The generated artifact is written to `apps/card-template/dist/index.html`. The APKG build uses this template automatically.

## Usefull Commands

- `bun run config:schema` - regenerate [`apps/deck-cli/deck.config.schema.json`](./apps/deck-cli/deck.config.schema.json)
- `bun run sentenceRetrieval:update` - update local [Tatoeba](https://tatoeba.org/en/) language metadata
- `bun run wordFrequencies:words` - update local frequency word data

## Data Sources

- [Tatoeba](https://tatoeba.org/en/) sentence search API: <https://api.tatoeba.org>
- [Tatoeba](https://tatoeba.org/en/) language metadata: <https://tatoeba.org/en/downloads>
- Frequency lists: <https://github.com/hermitdave/FrequencyWords>
- [Argos Translate](https://github.com/argosopentech/argos-translate): <https://github.com/argosopentech/argos-translate>
- Google Cloud Translation: <https://cloud.google.com/translate>
- Google Cloud Text-to-Speech: <https://cloud.google.com/text-to-speech>

## Project Status + Notes

This project is feature-complete for its original goal: generating personal [Anki](https://apps.ankiweb.net/) sentence decks from [Tatoeba](https://tatoeba.org/en/) with translation hints, difficulty ordering, audio, and a bundled card UI.

Future work is expected to be maintenance, source updates, small quality fixes.

Dont hesitate to send a pr and feel free to reach out if you have any questions :)

## License

MIT

See [`LICENSE`](./LICENSE)
