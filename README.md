# anki-language-sentence-study-decks

Build Anki sentence decks from Tatoeba, with word-level translation hints from a local Argos Translate server.

## Repo layout

- `source/cli.ts` - CLI entrypoint with pass-based subcommands
- `source/index.ts` - legacy entrypoint that forwards to the new pipeline CLI
- `source/modules/deck/` - deck pipeline modules (CSV IO, retrieval, metadata enrichment, apkg build)
- `source/modules/sentenceRetrieval/` - typed Tatoeba API wrapper + tests
- `source/modules/cardTemplate/` - Svelte card renderer bundled into a single HTML payload for Anki
- `source/modules/wordTranslator/` - FastAPI server exposing Argos Translate at `/translate`
- `source/modules/wordFrequencies/` - downloader for frequency list text files

## Nix flake

If you use Nix, you can enter a dev shell with all required tools (Bun, Python, uv, ruff, patch):

```bash
nix develop
```

If flakes are not enabled globally:

```bash
nix develop --extra-experimental-features "nix-command flakes"
```

Inside the shell, install project dependencies:

```bash
bun install --cwd source
bun install --cwd source/modules/cardTemplate
uv sync --directory source/modules/wordTranslator
```

## Argos configuration

Argos host/port defaults are read from `source/.env`.

Then adjust values as needed:

```dotenv
ARGOS_HOST=127.0.0.1
ARGOS_PORT=8000
ARGOS_TRANSLATION_CACHE_SIZE=5000
```

`ARGOS_TRANSLATION_CACHE_SIZE` controls the in-memory LRU cache size in the Argos API server (`0` disables caching).

## Quick start

1) Install dependencies:

```bash
bun install --cwd source
bun install --cwd source/modules/cardTemplate
uv sync --directory source/modules/wordTranslator
```

2) Start the translation service (in a separate terminal):

```bash
cd source
bun run argos:start
```

3) Run the full pass pipeline (retrieve -> enrich translations -> enrich difficulty -> enrich audio -> build apkg):

```bash
cd source
bun run deck:pipeline
```

## Pipeline passes

All passes are intentionally separated and operate through a CSV file.

1) Sentence retrieval (includes sentence-level translations from Tatoeba):

```bash
cd source
bun run deck:retrieve --csv ../output/example.csv --word must,laughing
```

2) Add word-level and n-gram translation metadata to the same CSV:

```bash
cd source
bun run deck:enrich-translations --csv ../output/example.csv
```

3) Calculate sentence difficulty + sort CSV from easiest to hardest:

```bash
cd source
bun run deck:enrich-difficulty --csv ../output/example.csv
```

4) Add audio metadata placeholders to the CSV (audio generation is not implemented yet):

```bash
cd source
bun run deck:enrich-audio --csv ../output/example.csv
```

5) Build the card template + convert CSV to APKG (CSV is kept):

```bash
cd source
bun run deck:build-apkg --csv ../output/example.csv --apkg ../output/example.apkg
```

You can inspect all CLI options with:

```bash
cd source
bun run cli.ts --help
```

## Data sources

- Tatoeba sentence search API: `https://api.tatoeba.org`
- Tatoeba supported language selector data: `https://tatoeba.org/en/downloads`
- Frequency lists: `https://github.com/hermitdave/FrequencyWords`
- Argos Translate: `https://github.com/argosopentech/argos-translate`

## TODO

### Functionality

- [ ] Make the card template prettier
- [ ] Add scripts for audio generation with GCP TTS, save as AAC inside m4a/mp4. (AAC for quality, small file size, compatibility with anki) (m4a/mp4 for storing custom metadata)
- [ ] Add UI for audio playback (jump to timestamp of a word, play+pause icons, add some indicator of which word is currently being spoken)
- [ ] Tweak word frequency categorization to be more accurate
- [ ] Fix the UI flickering on the card flips (html/js-loading issue)

### Code

- [ ] Make everything even more easily swappable (ex: AWS Polly for 11labs, Argos for google translate, etc)
- [ ] Add full generation guide in readme
- [ ] Add more details (license, inspiration, etc) and stuff in the readme 
- [ ] Finish wiring everything up so that i can generate 10k sentences
- [ ] Add caching of translations to the Argos server
- [x] Look up how ordering of cards work in anki. Then maybe calculate a difficulty score for each sentence (based on the number of words in a sentence as well as the frequency of the words) and order the deck based on that
- [ ] While building, do better console logs so that progress is clearer
