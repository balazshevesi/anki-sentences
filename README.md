# Anki Language Sentence Study Decks

A toolkit for building sentence-based Anki decks from Tatoeba data.

The project takes a list of target words, or the top N words from a frequency list, finds useful example sentences, enriches each card with translations, difficulty metadata, and Google Text-to-Speech audio, then exports a ready-to-import `.apkg` file.

This repository is intentionally small and mostly complete. It is built around one config-driven pipeline rather than a general-purpose product surface.

## What It Builds

Each generated deck can include:

- Source-language example sentences from Tatoeba
- Sentence translations from Tatoeba
- Word-by-word and n-gram translation hints from Argos Translate or Google Translate
- Difficulty scores based on local frequency data
- Google Text-to-Speech audio files and Anki `[sound:...]` tags
- Word-level audio timestamp metadata for the card UI
- A bundled Svelte Anki card template
- A final `.apkg` package that can be imported into Anki

## Repository Layout

- `apps/deck-cli/` - Bun/TypeScript CLI for the full deck generation pipeline
- `apps/deck-cli/deck.config.jsonc` - main deck configuration file
- `apps/deck-cli/deck.config.schema.json` - generated JSON Schema for the config file
- `apps/deck-cli/src/orchestration/` - ordered pipeline passes
- `apps/deck-cli/src/deck/` - CSV, APKG, card, difficulty, and template logic
- `apps/deck-cli/src/integrations/` - Tatoeba, frequency list, Argos, Google Translate, and Google TTS adapters
- `apps/card-template/` - Svelte card UI bundled into a single Anki template artifact
- `apps/argos-translate-service/` - small FastAPI wrapper around Argos Translate
- `docs/googleAuth.md` - local Google Cloud authentication notes
- `output/` - generated CSVs, audio, caches, and APKG files

## Requirements

The easiest development environment is the Nix shell:

```bash
nix develop
```

If flakes are not enabled globally:

```bash
nix develop --extra-experimental-features "nix-command flakes"
```

Without Nix, install equivalent tools yourself:

- Bun
- Python 3.11+
- uv
- ffmpeg
- Google Cloud CLI, if using Google APIs through Application Default Credentials

## Install

```bash
bun install --cwd apps/deck-cli
bun install --cwd apps/card-template
uv sync --directory apps/argos-translate-service
```

## Quick Start

Edit `apps/deck-cli/deck.config.jsonc`, then run the pipeline:

```bash
cd apps/deck-cli
bun run deck:pipeline
```

`deck:pipeline` builds the card template first, then runs the configured passes in order.

By default, generated files are written under `output/` from paths configured in `deck.config.jsonc`.

## Configuration

The pipeline is controlled by `apps/deck-cli/deck.config.jsonc`.

Important fields:

- `passes` - ordered list of pipeline passes to run
- `csvPath` - intermediate CSV used by all passes
- `deck.name` - Anki deck name
- `deck.outputPath` - final `.apkg` output path
- `deck.words` - explicit target words
- `deck.commonWordLimit` - add the top N words from the local frequency list
- `deck.sentenceLanguage` - Tatoeba language code for sentence lookup, for example `deu`
- `deck.translationLanguage` - Tatoeba language code for sentence translations, for example `eng`
- `translation.provider` - `argos` or `google`
- `audio.outputDir` - generated Google TTS audio directory
- `runtime.*` - concurrency and n-gram tuning knobs

The checked-in config references `./deck.config.schema.json`, so editors with JSON Schema support should provide validation and completion.

To run with another config file:

```bash
DECK_CONFIG_PATH=/absolute/or/relative/path.jsonc bun run src/index.ts
```

## Pipeline Passes

Available pass names:

- `retrieve` - fetch matching Tatoeba sentence rows into the CSV
- `enrich-translations` - add word and n-gram translation metadata
- `enrich-translation-alternatives` - fill missing translation alternatives where available
- `enrich-difficulty` - score and sort cards by difficulty
- `enrich-audio` - generate Google TTS audio and timestamp metadata
- `build-apkg` - build the Anki package

You can remove passes from `deck.config.jsonc` when iterating on a specific stage. For example, after retrieving sentences once, you can rerun only enrichment or packaging passes against the existing CSV.

## Translation Providers

### Argos Translate

Argos runs locally through the FastAPI service in `apps/argos-translate-service/`.

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

Supported environment overrides:

- `GOOGLE_TRANSLATE_API_KEY`
- `GOOGLE_TRANSLATE_ACCESS_TOKEN`
- `GOOGLE_TRANSLATE_URL`
- `GOOGLE_TRANSLATE_QUOTA_PROJECT`
- `GOOGLE_CLOUD_QUOTA_PROJECT`

Argos and Google translation caches should use separate files.

## Google Text-to-Speech

The audio pass uses Google Cloud Text-to-Speech and requires OAuth2 credentials. API keys are not supported for this endpoint.

For local development, use Application Default Credentials:

```bash
gcloud auth application-default login
```

Make sure the relevant APIs are enabled in your Google Cloud project:

- Cloud Text-to-Speech API
- Cloud Translation API, if using Google Translate

Optional audio overrides can be set in config or environment variables:

- `GOOGLE_TTS_ACCESS_TOKEN`
- `GOOGLE_TTS_LANGUAGE_CODE`
- `GOOGLE_TTS_VOICE`
- `GOOGLE_CLOUD_QUOTA_PROJECT`

`ffmpeg` must be available on `PATH`; the CLI transcodes generated speech to AAC before packaging it into Anki.

## Card Template

The card UI lives in `apps/card-template/` and is bundled into a single HTML artifact:

```bash
cd apps/deck-cli
bun run template:build
```

The generated artifact is written to `apps/card-template/dist/index.html`. The APKG build uses this template automatically.

## Maintenance Commands

Run these from `apps/deck-cli/` unless noted otherwise.

```bash
bun run test
bun run typecheck
bun run lint
bun run format:check
bun run config:schema
bun run sentenceRetrieval:update
bun run wordFrequencies:words
```

Useful commands:

- `bun run test` - run TypeScript tests
- `bun run typecheck` - typecheck the deck CLI and card template
- `bun run lint` - typecheck and run Ruff against the Argos service
- `bun run config:schema` - regenerate `deck.config.schema.json`
- `bun run sentenceRetrieval:update` - update local Tatoeba language metadata
- `bun run wordFrequencies:words` - update local frequency word data

## Data Sources

- Tatoeba sentence search API: `https://api.tatoeba.org`
- Tatoeba language metadata: `https://tatoeba.org/en/downloads`
- Frequency lists: `https://github.com/hermitdave/FrequencyWords`
- Argos Translate: `https://github.com/argosopentech/argos-translate`
- Google Cloud Translation: `https://cloud.google.com/translate`
- Google Cloud Text-to-Speech: `https://cloud.google.com/text-to-speech`

## Project Status

This project is feature-complete for its original goal: generating personal Anki sentence decks from Tatoeba with translation hints, difficulty ordering, audio, and a bundled card UI.

Future work is expected to be maintenance, source updates, small quality fixes, or deck-specific tuning rather than major new features.

## License

MIT

See [`LICENSE`](./LICENSE)
