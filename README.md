# anki-language-sentence-study-decks

Build Anki sentence decks from Tatoeba, with word-level translation hints from a local Argos Translate server.

## Repo layout

- `source/index.ts` - deck generator CLI entrypoint
- `source/modules/deck/` - deck pipeline modules (CLI config, sentence fetching, translation, template loading)
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

```bash
cp source/.env.example source/.env
```

Then adjust values as needed:

```dotenv
ARGOS_HOST=127.0.0.1
ARGOS_PORT=8000
```

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
cd source
bun run build
```

## Data sources

- Tatoeba sentence search API: `https://api.tatoeba.org`
- Tatoeba supported language selector data: `https://tatoeba.org/en/downloads`
- Frequency lists: `https://github.com/hermitdave/FrequencyWords`
- Argos Translate: `https://github.com/argosopentech/argos-translate`

## TODO

### Functionality

- [ ] Make the card template prettier
- [ ] Add scripts for audio generation with AWS Polly
- [ ] Add UI for audio playback (jump to timestamp of a word, play+pause icons, add some indicator of which word is currently being spoken)
- [ ] Tweak word frequency categorization to be more accurate
- [ ] Fix the UI flickering on the card flips (html/js-loading issue)

### Code

- [ ] Make everything even more easily swappable (ex: AWS Polly for 11labs, Argos for google translate, etc)
- [ ] Add full generation guide in readme
- [ ] Add more details (license, inspiration, etc) and stuff in the readme 
- [ ] Finish wiring everything up so that i can generate 10k sentences
