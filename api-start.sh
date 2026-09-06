#!/bin/bash
# =============================================================================
# API launcher (supervisord [program:api], runs as root)
#   1. loads the persisted JWT secret
#   2. waits for db-init to signal readiness (with a timeout)
#   3. execs the self-contained API bundle
# =============================================================================
set -uo pipefail

# --- JWT secret -------------------------------------------------------------
if [ -z "${JWT_SECRET:-}" ] && [ -f /app/data/.jwt-secret ]; then
  JWT_SECRET="$(cat /app/data/.jwt-secret)"
  export JWT_SECRET
fi
if [ -z "${JWT_SECRET:-}" ]; then
  echo "[api] WARNING: JWT_SECRET is not set — auth endpoints will fail." >&2
fi

# --- Wait for the database (db-init writes this marker on success) ----------
READY=/app/data/.db-ready
echo "[api] Waiting for database readiness..."
for _ in $(seq 1 90); do
  if [ -f "$READY" ]; then
    echo "[api] Database ready. Starting API on port ${PORT:-8080}."
    break
  fi
  sleep 1
done
if [ ! -f "$READY" ]; then
  echo "[api] WARN: DB readiness marker not seen after 90s — starting anyway." >&2
fi

exec node --enable-source-maps /app/artifacts/api-server/dist/index.mjs
