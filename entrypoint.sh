#!/bin/bash
# =============================================================================
# Trailhead Ledger — container entrypoint (runs as root, PID 1)
#   1. prepares the data volume + ownership
#   2. persists a JWT secret across restarts
#   3. first-run: initializes the embedded PostgreSQL data dir
#   4. hands off to supervisord (postgres / db-init / api / nginx)
# =============================================================================
set -euo pipefail

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
PGDATA=/app/data/postgres

echo "[entrypoint] Trailhead Ledger starting (PUID=${PUID} PGID=${PGID})"

# --- Data volume + Postgres runtime dirs -----------------------------------
mkdir -p /app/data "$PGDATA" /var/run/postgresql

# Postgres refuses to run if the data dir isn't owned by the postgres user
# and is world-accessible.
chown -R postgres:postgres "$PGDATA"
chmod 700 "$PGDATA"
chown postgres:postgres /var/run/postgresql

# --- JWT secret: generate once, persist so sessions survive restarts --------
JWT_SECRET_FILE=/app/data/.jwt-secret
if [ -z "${JWT_SECRET:-}" ]; then
  if [ ! -f "$JWT_SECRET_FILE" ]; then
    openssl rand -hex 32 > "$JWT_SECRET_FILE"
    echo "[entrypoint] Generated new JWT secret -> $JWT_SECRET_FILE"
  fi
else
  # Respect an operator-provided secret, but keep a copy on the volume.
  printf '%s' "$JWT_SECRET" > "$JWT_SECRET_FILE"
fi
chmod 600 "$JWT_SECRET_FILE"

# --- First run: initialize PostgreSQL --------------------------------------
PGBIN="/usr/lib/postgresql/15/bin"
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "[entrypoint] First run detected — initializing PostgreSQL..."
  sudo -u postgres "$PGBIN/initdb" -D "$PGDATA"
  # Listen on loopback so the API (127.0.0.1:5432) can connect.
  cat >> "$PGDATA/postgresql.conf" <<'CONF'
listen_addresses = 'localhost'
CONF
  echo "[entrypoint] PostgreSQL initialized."
fi

# --- Host-side file ownership (Unraid convention) ---------------------------
# Keep the Postgres data dir postgres-owned; give the rest of the volume to
# the host user so files are readable/backup-able from the Unraid host.
if [ "$PUID" != "0" ]; then
  chown -R "${PUID}:${PGID}" /app/data 2>/dev/null || true
  chown -R postgres:postgres "$PGDATA"
  chmod 700 "$PGDATA"
  chown postgres:postgres /var/run/postgresql
fi

echo "[entrypoint] Handing off to supervisord..."
exec /usr/bin/supervisord -n -c /etc/supervisor/supervisord.conf
