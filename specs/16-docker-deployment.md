---
description: Single-container deployment — supervisord process table, boot sequence, nginx, health, and data volume.
status: active
---

# 16 — Docker Deployment & Boot Sequence

One image, one port (80), no internal SSL. supervisord (PID 1) runs four
programs in priority order: **postgres → db-init (one-shot) → api → nginx**.
The app is designed for Unraid behind an external reverse proxy.

Files: `Dockerfile`, `entrypoint.sh`, `supervisord.conf`, `db-init.sh`,
`api-start.sh`, `nginx.conf`.

## Image build (multi-stage)

- **Stage 1 (builder)** — `node:24-bookworm`: `pnpm install --frozen-lockfile`
  → build api (`esbuild` → `dist/index.mjs`, `lib/db` inlined) + web
  (`vite build`) → `pnpm deploy --legacy` produces:
  - `/prod/api` — api-server **prod** node_modules (bundle externalizes npm
    packages)
  - `/prod/db` — `@scout-expense-tracker/db` **with devDeps** so
    `drizzle-kit push` can run at boot.
- **Stage 2 (runtime)** — `node:24-bookworm-slim` + apt: `postgresql`,
  `nginx`, `supervisor`, `sudo`, `openssl`, `curl`.
  - Copies `/prod/api/node_modules`, api `dist`, web `dist`, `/prod/db`
    (to `/app/db`).
  - Strips source maps from the api dist.
  - Bakes `VERSION`/`GIT_SHA` (build args, default `dev`) → surfaced at
    `/api/health`.
  - `EXPOSE 80`; `HEALTHCHECK` curls `http://127.0.0.1/api/health`
    (interval 30s, start-period 40s, 3 retries).
  - `ENTRYPOINT ["/app/entrypoint.sh"]`.

## Boot sequence

### 1. `entrypoint.sh` (root, PID 1 → execs supervisord)
- `PUID`/`PGID` (default `1000:1000`) for Unraid volume ownership.
- Prepares `/app/data` + `/app/data/postgres` (postgres-owned, `chmod 700`).
- **JWT secret**: if `JWT_SECRET` unset, generate once via
  `openssl rand -hex 32` → `/app/data/.jwt-secret` (persists across restarts
  so sessions survive); if set, persist a copy to the volume.
- First run: `initdb` the embedded PostgreSQL 15 data dir; force
  `listen_addresses = 'localhost'`.
- Host-side ownership: `/app/data` → `PUID:PGID` (except the postgres data
  dir which stays postgres-owned).
- `exec supervisord -n`.

### 2. `supervisord.conf`
| Program | priority | user | notes |
|---|---|---|---|
| `postgres` | 10 | `postgres` | `postgres -D /app/data/postgres`; autorestart |
| `db-init` | 20 | `root` | one-shot (`autorestart=false`); runs `/app/db-init.sh` |
| `api` | 30 | `root` | `/app/api-start.sh`; autorestart, 10 retries |
| `nginx` | 40 | `root` | `nginx -g "daemon off;"`; autorestart |

Logs → `/app/data/*.log` (5 MB × 3 rotation).

### 3. `db-init.sh` (one-shot, idempotent)
1. Wait for Postgres (`pg_isready`, up to 60s).
2. `rm -f /app/data/.db-ready` (clear stale marker).
3. `createdb` if the database is missing (`DB_NAME`, default
   `scout_expense_tracker`).
4. `drizzle-kit push --force` (from `/app/db`) — additive schema sync.
5. **Backfill 1**: split legacy `scouts.name` → `first_name`/`last_name`
   where empty.
6. **Backfill 2**: flip dues entries whose `dues_transactions` payments
   already cover the full amount to `is_paid=true` (backfill `paid_at` from
   the last payment row).
7. `node dist/seed-admin.mjs` — first-run admin (no-op if users exist; refuses
   weak `DEFAULT_ADMIN_PASSWORD`).
8. `touch /app/data/.db-ready`.

### 4. `api-start.sh`
- Loads `JWT_SECRET` from `/app/data/.jwt-secret` if the env var is unset.
- Waits up to 90s for `/app/data/.db-ready` (warns and starts anyway if
  absent).
- `exec node --enable-source-maps /app/artifacts/api-server/dist/index.mjs`
  on `PORT` (default 8080).

### 5. `nginx.conf` (port 80)
- Serves `artifacts/web/dist`; SPA fallback (`try_files … /index.html`).
- `/assets/` → `Cache-Control: public, max-age=31536000, immutable`;
  `index.html` → `no-cache`.
- `gzip` on (js/css/json/svg/html), `client_max_body_size 10m`.
- `location /api` → `proxy_pass http://127.0.0.1:8080` with standard
  forwarding headers (`X-Forwarded-For`, `X-Forwarded-Proto`, `X-Real-IP`,
  WebSocket upgrade), 300s read/send timeouts.

## API server middleware order (index.ts)

`pino-http` (logger) → `express.json` / `urlencoded` → `cors`
(`CORS_ORIGIN`, default `*`) → `cookie-parser` → **`authMiddleware` (optional)**
→ routes (`/api/*`) → 404 → error handler. **`trust proxy = 1`** (one reverse
proxy hop).

## Data volume

- `/app/data` is **the** persistent volume: `postgres/` (data dir),
  `.jwt-secret`, `.db-ready`, `*.log`, `supervisord.log`.
- Everything else in the image is rebuildable.
- Back up `/app/data` (or use the app-level zip export, `13-backup-restore.md`).

## Configuration (env)

| Var | Default | Set by |
|---|---|---|
| `PORT` | `8080` | image |
| `DATABASE_URL` | `postgresql://postgres:postgres@127.0.0.1:5432/scout_expense_tracker` | image |
| `DB_NAME` | `scout_expense_tracker` | db-init.sh |
| `JWT_SECRET` | auto-generated → volume | entrypoint.sh |
| `CORS_ORIGIN` | `*` | image |
| `LOG_LEVEL` | `info` | image |
| `DEFAULT_ADMIN_USERNAME` | `admin` | seed |
| `DEFAULT_ADMIN_PASSWORD` | `ChangeMe123!` | seed |
| `PUID` / `PGID` | `1000` | entrypoint.sh |
| `VERSION` / `GIT_SHA` | `dev` | build args |

## Operational commands

```bash
docker compose up --build -d      # build + start (first build is slow)
docker compose logs -f            # watch supervisord + all 4 processes
docker compose ps                 # healthcheck status
curl -fsS http://localhost:8080/api/health
# login smoke test (fresh boot):
curl -fsS -X POST http://localhost:8080/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"ChangeMe123!"}'   # -> { token }
# persistence check:
docker compose down && docker compose up -d              # data survives
# full reset:
docker compose down && rm -rf ./data && docker compose up --build -d
```

## Testing (the dev/test loop)

- Fresh boot: health 200 with `status:"ok"`, `version`, `gitSha`; login
  succeeds with default admin; `.db-ready` present.
- Reboot: `docker compose down && up -d` → data survives, no re-seed, JWT
  sessions survive (same secret).
- Reset: `rm -rf ./data` + rebuild → clean first-run (admin re-seeded).
- Healthcheck: `docker compose ps` shows healthy within start-period.
- `drizzle-kit push` failure → db-init exits non-zero, API does not start,
  container healthcheck fails (no silent bad state).

## Acceptance Criteria

- [ ] One `docker compose up` yields a healthy container with a working
      login, on port 80 only.
- [ ] The four processes boot in dependency order and restart independently.
- [ ] JWT secret and all data persist across `down`/`up`.
- [ ] Schema changes ship via `drizzle-kit push` at boot (additive), with
      idempotent backfills where needed.
- [ ] `/api/health` reports status, version, and git sha.

## Open Questions

None.
