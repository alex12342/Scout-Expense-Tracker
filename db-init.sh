#!/bin/bash
# =============================================================================
# One-shot database bootstrap (supervisord [program:db-init], runs as root)
#   waits for Postgres -> createdb -> drizzle push -> seed admin -> signal
# Idempotent: safe to run on every boot.
# =============================================================================
set -uo pipefail

PGBIN="/usr/lib/postgresql/15/bin"
DB_NAME="${DB_NAME:-scout_expense_tracker}"
export DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/${DB_NAME}}"
READY=/app/data/.db-ready

echo "[db-init] Waiting for PostgreSQL..."
ready=0
for _ in $(seq 1 60); do
  if sudo -u postgres "$PGBIN/pg_isready" -h 127.0.0.1 -q 2>/dev/null; then
    ready=1
    break
  fi
  sleep 1
done
if [ "$ready" -ne 1 ]; then
  echo "[db-init] ERROR: PostgreSQL never became ready." >&2
  exit 1
fi
echo "[db-init] PostgreSQL is up."

# Clear any stale readiness marker so the API waits for THIS run to finish.
rm -f "$READY"

# --- Create the database if missing ----------------------------------------
if ! sudo -u postgres psql -lqt | cut -d '|' -f 1 | grep -qw "$DB_NAME"; then
  echo "[db-init] Creating database: $DB_NAME"
  sudo -u postgres createdb "$DB_NAME"
fi

# --- Schema sync (adds missing tables/columns, does not drop data) ----------
echo "[db-init] Running drizzle-kit push..."
if (cd /app/db && ./node_modules/.bin/drizzle-kit push --force --config ./drizzle.config.ts); then
  echo "[db-init] Schema sync complete."
else
  echo "[db-init] ERROR: drizzle-kit push failed." >&2
  exit 1
fi

# --- One-time backfill: split legacy scouts.name into first/last (idempotent) --
# New schema columns (first_name/last_name/age) were added by the push above.
# For rows that still have an empty first_name, derive it from the legacy
# combined `name` (first word -> first_name, remainder -> last_name). The
# `name` column is preserved (kept in sync by the API). Safe to run every boot.
echo "[db-init] Backfilling scout first/last names (no-op if already set)..."
sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 -q <<'SQL'
UPDATE scouts
SET first_name = split_part(btrim(name), ' ', 1),
    last_name  = regexp_replace(btrim(name), '^\S+\s*', '')
WHERE btrim(first_name) = '' AND btrim(name) <> '';
SQL

# --- Seed the initial admin (no-op if users already exist) ------------------
echo "[db-init] Seeding admin user (no-op if present)..."
if node /app/artifacts/api-server/dist/seed-admin.mjs; then
  echo "[db-init] Admin seed done."
else
  echo "[db-init] WARN: admin seed did not run (will surface on first login)." >&2
fi

# --- Signal the API that the database is ready ------------------------------
touch "$READY"
echo "[db-init] Database ready."
