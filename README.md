# anki-language-sentence-study-decks

Build Anki sentence decks from Tatoeba, with word-level translation hints from a local Argos Translate server and Google Text-to-Speech audio metadata.

## Repo layout

- `source/deck.config.jsonc` - single config file for all deck generation settings
- `source/deck.config.schema.json` - JSON Schema generated from Zod (`z.toJSONSchema`)
- `source/index.ts` - config-driven pipeline entrypoint
- `source/modules/config/` - JSONC loader + Zod schema + schema generation script
- `source/modules/deck/` - deck pipeline modules (CSV IO, retrieval, metadata enrichment, apkg build)
- `source/modules/audioGeneration/` - Google TTS generation + language mapping helpers
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

Deck generation reads Argos settings from `source/deck.config.jsonc`:

```jsonc
"argos": {
  "sourceLanguage": "en",
  "targetLanguage": "hu",
  "alternatives": 3,
  "translateUrl": "http://127.0.0.1:8000/translate"
}
```

The local Argos server startup script still supports `.env` host/port overrides:

```dotenv
ARGOS_HOST=127.0.0.1
ARGOS_PORT=8000
```

## Google Text-to-Speech configuration

The audio enrichment pass uses the Google Cloud Text-to-Speech REST API and stores:

- a generated `.mp3` filename per sentence,
- an Anki sound tag (`[sound:filename.mp3]`),
- per-word start/end timestamps in milliseconds.

Google Text-to-Speech requires OAuth2 credentials (API keys are not supported for this endpoint).

For local development, the easiest setup is:

```bash
gcloud auth application-default login
```

Alternative: use a service account key file:

```dotenv
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

Optional: provide a short-lived bearer token manually:

```dotenv
GOOGLE_TTS_ACCESS_TOKEN=ya29.your_access_token
```

Optional overrides:

```jsonc
"audio": {
  "languageCode": "en-US",
  "voiceName": "en-US-Chirp3-HD-Achernar",
  "speakingRate": 1,
  "pitch": 0,
  "concurrency": 2
}
```

Google TTS authentication uses OAuth2 credentials.

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

The pipeline is now fully config-driven.

1) Edit `source/deck.config.jsonc`.

2) Choose which passes to run by updating the `passes` array.

3) Run:

```bash
cd source
bun run deck:pipeline
```

Optional: use a different config file with `DECK_CONFIG_PATH=/absolute/or/relative/path.jsonc`.

Pass names:

- `retrieve`
- `enrich-translations`
- `enrich-difficulty`
- `enrich-audio`
- `build-apkg`

Audio files are written to `audio.outputDir` from `deck.config.jsonc`.

If `cardPayload.audioMetadata` contains ready Google TTS entries, matching `.mp3` files are automatically bundled into the APKG media collection.

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
- [ ] Add proper code formatting
- [ ] Add full generation guide in readme
- [ ] Add more details (license, inspiration, etc) and stuff in the readme 
- [ ] Finish wiring everything up so that i can generate 10k sentences
