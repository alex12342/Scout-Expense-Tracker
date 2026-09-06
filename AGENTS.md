# AGENTS.md — Trailhead Ledger (Scout Expense Tracker)

Self-hosted, single-Docker-container web app for tracking a Boy Scout troop's
finances: scout ledgers, troop bank accounts, and events with per-scout cost
splits. Built to run on Unraid behind an external reverse proxy. **One port in,
no SSL inside the container.**

## Stack

pnpm monorepo (TypeScript everywhere):
- **artifacts/api-server** — Express 5 + pino + zod + jsonwebtoken + bcryptjs. Bundled with esbuild.
- **artifacts/web** — Vite 7 + React 19 + Tailwind v4 + @tanstack/react-query + wouter.
- **lib/db** — Drizzle ORM schema + lazy `node-postgres` client (shared by the API).

## Commands

```bash
pnpm install                 # pnpm ONLY (a preinstall hook rejects npm/yarn)
pnpm run typecheck           # typechecks all packages (tsc --noEmit)
pnpm run build               # typecheck + build api-server & web
pnpm run dev:api             # API on :8080 (tsx watch) — needs a live Postgres + DATABASE_URL
pnpm run dev:web             # Vite dev server on :5173 (proxies /api -> :8080)
pnpm --filter @scout-expense-tracker/db push        # drizzle-kit push (apply schema)
pnpm --filter @scout-expense-tracker/db push-force  # push --force (no prompt)
pnpm --filter @scout-expense-tracker/api-server seed # run the admin seed
```

Run a single package's typecheck/build:
```bash
pnpm --filter @scout-expense-tracker/api-server typecheck
pnpm --filter @scout-expense-tracker/web build
```

**There is no unit-test suite.** Verify with `pnpm run typecheck` + `pnpm run build` +
the Docker smoke test below.

## Environment (all read by the API at runtime)

| Var | Default | Notes |
|-----|---------|-------|
| `PORT` | `8080` | API listen port (internal; Nginx fronts :80) |
| `DATABASE_URL` | `postgresql://postgres:postgres@127.0.0.1:5432/scout_expense_tracker` | embedded Postgres |
| `DB_NAME` | `scout_expense_tracker` | used by db-init.sh |
| `JWT_SECRET` | *(auto-generated)* | if unset, generated once → `/app/data/.jwt-secret`. **Required** or auth throws. |
| `CORS_ORIGIN` | `*` | comma-separated origins or `*` |
| `LOG_LEVEL` | `info` | pino level |
| `DEFAULT_ADMIN_USERNAME` | `admin` | first-run seed only (when users table empty) |
| `DEFAULT_ADMIN_PASSWORD` | `ChangeMe123!` | first-run seed only; must pass strength check |
| `PUID` / `PGID` | `1000` | Unraid host uid/gid for volume file ownership |

## Architecture (single container)

`supervisord` (PID 1 after `entrypoint.sh`) runs four programs, in priority order:

1. **postgres** — embedded PostgreSQL 15, data dir `/app/data/postgres` (runs as the `postgres` user).
2. **db-init** — *one-shot*: wait for pg → `createdb` → `drizzle-kit push --force` → seed admin → write `/app/data/.db-ready`.
3. **api** — waits for `.db-ready`, then `node dist/index.mjs` on :8080.
4. **nginx** — serves `artifacts/web/dist` on :80, proxies `/api` → `127.0.0.1:8080`.

Boot sequence lives in: `Dockerfile`, `entrypoint.sh`, `supervisord.conf`,
`db-init.sh`, `api-start.sh`, `nginx.conf`.

### Key invariants (do not break)
- **Single `transactions` table, signed amounts from the troop's perspective**:
  positive = money in (deposits, scout payments), negative = money out (expenses,
  reimbursements). Balances are **computed** with `SUM()`, never stored.
- **Event cost splits**: creating an event auto-splits the total across its
  participants (overridable per scout) and writes one `event_allocation`
  transaction (−amount) per participant. Recording a payment writes an
  `event_payment` (+amount) and bumps the participant's `amount_paid`.
- **The API bundle is self-contained**: esbuild inlines `lib/db`; only bare npm
  packages are externalized (resolved from `pnpm deploy`'d `node_modules`).

## Dev & deployment quirks

- **pnpm only.** `preinstall` hook hard-fails on npm/yarn. `pnpm-workspace.yaml`
  enforces `minimumReleaseAge: 1440` (1-day npm supply-chain buffer) — do not bypass.
- **`lib/db` is TypeScript source** (exports `./src/index.ts`). It is *inlined* into
  the API bundle at build time — never import it expecting a compiled artifact.
  The runtime image also ships a `pnpm deploy`'d copy at `/app/db` **with devDeps**
  so `drizzle-kit push` can run at boot.
- **Express 5**: `req.params.id` can be `string | string[]` — guard it before use.
- **drizzle helpers** (`eq`, `and`, `count`, …) are imported from the `drizzle-orm`
  package directly in route files, not re-exported by `lib/db`.
- **Trust proxy = 1** (one reverse proxy hop). `X-Forwarded-For` is set by Nginx.
- **Postgres auth** is `trust` for loopback (Debian `initdb` default) — the
  `postgres:postgres` password in `DATABASE_URL` is effectively unused locally.

## Docker workflow (the real dev/test loop)

```bash
docker compose up --build -d      # build + start (first build is slow)
docker compose logs -f            # watch supervisord + all 4 processes
docker compose ps                 # healthcheck status
curl -fsS http://localhost:8080/api/health
```

Smoke test a fresh boot (data in `./data`):
```bash
curl -fsS http://localhost:8080/api/health
curl -fsS -X POST http://localhost:8080/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"ChangeMe123!"}'   # -> { token }
```
Persistence check: `docker compose down && docker compose up -d` → data survives.

To reset: `docker compose down && rm -rf ./data && docker compose up --build -d`.

## Design system (Trailhead Ledger)

- Fonts: **Bricolage Grotesque** (display), **Instrument Sans** (body),
  **IBM Plex Mono** (all dollar figures — use tabular numerals / `font-mono`).
- Palette tokens in `artifacts/web/src/styles.css`: pine (primary), moss,
  ember (destructive), canvas/surface (backgrounds), line (borders).
- Topographic-contour texture as the signature background motif.
- UI primitives in `artifacts/web/src/components/ui/` (CVA + `cn()` from clsx/tailwind-merge).
