# anki-language-sentence-study-decks

Build Anki sentence decks from Tatoeba, with word-level translation hints from a local Argos Translate server.

## Repo layout

- `scripts/index.ts` - deck generator CLI entrypoint
- `scripts/deck/` - deck pipeline modules (CLI config, sentence fetching, translation, template loading)
- `scripts/sentences/` - typed Tatoeba API wrapper + tests
- `scripts/app/` - Preact card renderer that is bundled into a single HTML payload for Anki
- `scripts/translate/` - FastAPI server exposing Argos Translate at `/translate`
- `scripts/words/` - downloader for frequency list text files

## Quick start

1) Install Bun dependencies:

```bash
cd scripts
bun install
cd app
bun install
```

2) Start the translation service (in a separate terminal):

```bash
cd scripts/translate
uv sync
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

3) Build the deck:

```bash
cd scripts
bun run run -- --word=must --output=output/example.apkg
```

The generated deck file is written under `scripts/output/` by default.

## Main commands

Run from `scripts/` unless noted otherwise.

- `bun run run` - build app bundle and generate deck
- `bun run app:build` - build the single-file Preact renderer for cards
- `bun run test` - run sentence wrapper tests
- `bun run typecheck` - typecheck scripts + app
- `bun run lint` - run typechecks and Python lint checks
- `bun run update:languages` - refresh generated language list from Tatoeba
- `bun run update:words` - download default frequency word files

## Deck generator options

`bun run index.ts --help`

Supported options include:

- `--word=<text>`
- `--deck-name=<text>`
- `--output=<path>`
- `--sentence-lang=<tatoeba-code>` (default: `eng`)
- `--translation-lang=<tatoeba-code>` (default: `hun`)
- `--word-count=<range>` (default: `4-40`)
- `--limit=<int>` (default: `10`)
- `--argos-source=<code>` / `--argos-target=<code>` (default: `en` -> `hu`)
- `--argos-url=<url>` (default: `http://127.0.0.1:8000/translate`)

## Data sources

- Tatoeba sentence search API: `https://api.tatoeba.org`
- Tatoeba supported language selector data: `https://tatoeba.org/en/downloads`
- Frequency lists: `https://github.com/hermitdave/FrequencyWords`
- Argos Translate: `https://github.com/argosopentech/argos-translate`
