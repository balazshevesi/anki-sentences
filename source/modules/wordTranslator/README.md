# Argos Translate server with uv

This folder runs a small local API server with a `/translate` endpoint powered by `argostranslate`.

## 1) Install dependencies

```bash
uv sync
```

## 2) Start the server

```bash
uv run uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## 3) Call `/translate`

```bash
curl -X POST http://127.0.0.1:8000/translate \
  -H "Content-Type: application/json" \
  -d '{"q":"Hello world","source":"en","target":"es"}'
```

Expected response shape:

```json
{"translatedText":"Hola mundo"}
```

## Optional: preinstall model pairs at startup

The first request for a new language pair downloads its model automatically. You can also preload models on startup:

```bash
ARGOS_PREINSTALL_PAIRS=en:es,en:de uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

## Health endpoint

```bash
curl http://127.0.0.1:8000/health
```

## Lint

From `scripts/` run:

```bash
bun run lint:py
```
