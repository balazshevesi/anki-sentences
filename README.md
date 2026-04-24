# anki-language-sentence-study-decks

Build Anki sentence decks from Tatoeba, with word-level translation hints from a local Argos Translate server and Google Text-to-Speech audio metadata.

## Repo layout

- `apps/deck-cli/deck.config.jsonc` - single config file for all deck generation settings
- `apps/deck-cli/deck.config.schema.json` - JSON Schema generated from Zod (`z.toJSONSchema`)
- `apps/deck-cli/src/index.ts` - config-driven pipeline entrypoint
- `apps/deck-cli/src/orchestration/` - pipeline orchestration and ordered passes
- `apps/deck-cli/src/deck/` - deck domain logic (CSV IO, enrichment helpers, APKG helpers)
- `apps/deck-cli/src/integrations/` - API clients and external data adapters (Tatoeba, Argos, Google TTS, frequency lists)
- `apps/deck-cli/src/contracts/` - shared card payload + audio metadata contracts
- `apps/card-template/` - Svelte card renderer bundled into a single HTML payload for Anki
- `apps/argos-translate-service/` - FastAPI server exposing Argos Translate at `/translate`

## Nix flake

If you use Nix, you can enter a dev shell with all required tools (Bun, Python, uv, ruff, patch, ffmpeg):

```bash
nix develop
```

If flakes are not enabled globally:

```bash
nix develop --extra-experimental-features "nix-command flakes"
```

Inside the shell, install project dependencies:

```bash
bun install --cwd apps/deck-cli
bun install --cwd apps/card-template
uv sync --directory apps/argos-translate-service
```

## Argos configuration

Deck generation reads Argos settings from `apps/deck-cli/deck.config.jsonc`:

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

- a generated `.aac` filename per sentence,
- an Anki sound tag (`[sound:filename.aac]`),
- per-word start/end timestamps in milliseconds.

Google TTS audio is transcoded to AAC with `ffmpeg`, so `ffmpeg` must be installed and available on `PATH` when running the audio pass.

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
bun install --cwd apps/deck-cli
bun install --cwd apps/card-template
uv sync --directory apps/argos-translate-service
```

2) Start the translation service (in a separate terminal):

```bash
cd apps/deck-cli
bun run argos:start
```

3) Run the full pass pipeline (retrieve -> enrich translations -> enrich difficulty -> enrich audio -> build apkg):

```bash
cd apps/deck-cli
bun run deck:pipeline
```

## Pipeline passes

The pipeline is now fully config-driven.

1) Edit `apps/deck-cli/deck.config.jsonc`.

2) Choose which passes to run by updating the `passes` array.

3) Run:

```bash
cd apps/deck-cli
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

If `cardPayload.audioMetadata` contains ready Google TTS entries, matching `.aac` files are automatically bundled into the APKG media collection.

## Data sources

- Tatoeba sentence search API: `https://api.tatoeba.org`
- Tatoeba supported language selector data: `https://tatoeba.org/en/downloads`
- Frequency lists: `https://github.com/hermitdave/FrequencyWords`
- Argos Translate: `https://github.com/argosopentech/argos-translate`

## TODO (the project is currently like 90% complete, maybe like 5h left of work)

- [ ] Make the card templates display things properly
  - [ ] Fix the UI flickering on the card flips (html/js-loading issue)
  - [ ] Center the text and fix the styling
  - [ ] Sync spoken word(s) with displayed text (underline spoken word) + on click of a word: jump to timestamp of audio
- [x] Encode generated audio clips as AAC
- [ ] Add the loop for gathering the x most common words before generating
- [ ] Implement proper adapter pattern so that services can be swapped easier
- [ ] Add full guide in readme
- [ ] Add more details (license, inspiration, etc) and stuff in the readme 
- [x] Add proper code formatting
- [ ] Tweak word frequency categorization to be more accurate
- [ ] Double check that all the scripts make sense
