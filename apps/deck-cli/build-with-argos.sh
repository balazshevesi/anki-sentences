#!/usr/bin/env sh
set -eu

if [ -f ./.env ]; then
  set -a
  . ./.env
  set +a
fi

ARGOS_HOST="${ARGOS_HOST:-127.0.0.1}"
ARGOS_PORT="${ARGOS_PORT:-8000}"
ARGOS_HEALTH_URL="http://${ARGOS_HOST}:${ARGOS_PORT}/health"
ARGOS_TRANSLATE_URL="http://${ARGOS_HOST}:${ARGOS_PORT}/translate"

uv run --directory ../argos-translate-service python -m uvicorn main:app --host "$ARGOS_HOST" --port "$ARGOS_PORT" >/tmp/argos-server.log 2>&1 &
ARGOS_PID=$!

cleanup() {
  kill "$ARGOS_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

attempt=0
until curl -fsS "$ARGOS_HEALTH_URL" >/dev/null 2>&1; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo "Argos server did not become healthy in time."
    echo "See /tmp/argos-server.log for details."
    exit 1
  fi
  sleep 1
done

ARGOS_TRANSLATE_URL="$ARGOS_TRANSLATE_URL" bun run deck:build
