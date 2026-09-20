# 00 — Project Overview: Trailhead Ledger (Scout Expense Tracker)

Self-hosted, single-Docker-container web app for tracking a Boy Scout troop's
finances: scout and leader ledgers, troop bank accounts, and events with
per-member cost splits, plus a dues tracker. Built to run on Unraid behind an
external reverse proxy. **One port in (80), no SSL inside the container.**

This directory (`/specs`) is the source of truth for architecture and features.
Every spec must match the code unless explicitly marked `superseded`.

## Repository layout

pnpm monorepo (TypeScript everywhere), pnpm-only (a `preinstall` hook rejects
npm/yarn):

| Path | Package | Role |
|------|---------|------|
| `artifacts/api-server` | `@scout-expense-tracker/api-server` | Express 5 API (pino, zod, jsonwebtoken, bcryptjs, jszip, multer). Bundled with esbuild into a self-contained `dist/index.mjs`. |
| `artifacts/web` | `@scout-expense-tracker/web` | Vite 7 + React 19 SPA (Tailwind v4, @tanstack/react-query, wouter, react-hook-form). |
| `lib/db` | `@scout-expense-tracker/db` | Drizzle ORM schema + lazy `node-postgres` client. **TypeScript source** (`./src/index.ts`), inlined into the API bundle at build time. |
| `/` (root) | `scout-expense-tracker` | Workspace scripts, Docker image, supervisord, nginx, db-init. |

## Key architectural invariants

1. **Single `transactions` table, signed integer cents from the troop's
   perspective** — positive = money in, negative = money out. Balances are
   always **computed** with `SUM(amount_cents)`, never stored. See
   `06-transactions-ledger.md`.
2. **Money is integer cents end-to-end** (no floats). UI formats cents→dollars.
3. **Scouts and leaders are parallel members**: `transactions.scout_id` and
   `transactions.leader_id` are both FKs; event participants are exactly one
   scout XOR one leader (DB CHECK constraint).
4. **Event cost splits**: creating an event auto-splits costs across
   participants (overridable per line item) and writes one signed
   `event_allocation` transaction per participant. Event rows are immutable
   once written — corrections happen via `update-costs` deltas or
   `event_true_up` at finalization.
5. **Dues are a tracker, separate from the ledger**: `dues_cycles` (periods) +
   `dues` (per-member) + `dues_transactions` (audit). Partial payments are
   tracked cumulatively; only `record-payment`/`apply-deposit` write
   `dues_payment` ledger rows.
6. **The API bundle is self-contained**: esbuild inlines `lib/db`; only bare
   npm packages are externalized (resolved from a `pnpm deploy`'d
   `node_modules` shipped in the image).
7. **Single container, four supervised processes**: postgres → db-init (one-shot)
   → api → nginx. See `16-docker-deployment.md`.
8. **Route ordering matters (Express 5)**: specific routes (e.g. `/waive`,
   `/bulk-toggle`) must be registered before catch-all `/:id` routes in the
   same router, or they are shadowed.

## Spec conventions (this directory)

- File names start with a two-digit creation-order number
  (`NN-topic.md`).
- Every file except `00-project-overview.md` carries YAML frontmatter:
  `description`, `status` (`proposed` | `active` | `superseded`), and
  `replacement` when superseded. Missing frontmatter defaults to `proposed`.
- Mandatory sections in every spec: **Configuration**, **Testing**,
  **Acceptance Criteria**, **Open Questions** (open questions must be resolved
  before a spec moves to `active`).

## Workflow

- **New feature**: human writes spec → LLM reviews/refines → LLM writes code.
- **Change to existing code**: human updates/adds superseding spec → LLM
  reviews/refines → LLM adjusts code.
- **Bug fix**: review spec first; trivial fixes may bypass spec changes,
  larger ones require an amendment.

## Commands

```bash
pnpm install                 # pnpm ONLY (preinstall hook rejects npm/yarn)
pnpm run typecheck           # all packages (tsc --noEmit)
pnpm run build               # typecheck + build api-server & web
pnpm run dev:api             # API on :8080 (tsx watch) — needs Postgres + DATABASE_URL
pnpm run dev:web             # Vite dev server on :5173 (proxies /api -> :8080)
pnpm --filter @scout-expense-tracker/db push        # drizzle-kit push
pnpm --filter @scout-expense-tracker/db push-force  # push --force (no prompt)
pnpm --filter @scout-expense-tracker/api-server seed # admin seed
```

**There is no unit-test suite.** Verification is `pnpm run typecheck` +
`pnpm run build` + the Docker smoke test (see `16-docker-deployment.md`).

## Environment (API runtime)

| Var | Default | Notes |
|-----|---------|-------|
| `PORT` | `8080` | API listen port (internal; nginx fronts :80) |
| `DATABASE_URL` | `postgresql://postgres:postgres@127.0.0.1:5432/scout_expense_tracker` | embedded Postgres |
| `DB_NAME` | `scout_expense_tracker` | used by db-init.sh |
| `JWT_SECRET` | *(auto-generated)* | if unset, generated once → `/app/data/.jwt-secret`; **required** or auth throws |
| `CORS_ORIGIN` | `*` | comma-separated origins or `*` |
| `LOG_LEVEL` | `info` | pino level |
| `DEFAULT_ADMIN_USERNAME` | `admin` | first-run seed only (users table empty) |
| `DEFAULT_ADMIN_PASSWORD` | `ChangeMe123!` | first-run seed only; must pass strength check |
| `PUID` / `PGID` | `1000` | Unraid host uid/gid for volume ownership |
| `VERSION` / `GIT_SHA` | `dev` | baked into image; surfaced at `/api/health` |

## Spec index

| # | Spec | Status |
|---|------|--------|
| 01 | [Authentication & user management](01-authentication.md) | active |
| 02 | [Data model & persistence conventions](02-data-model.md) | active |
| 03 | [Scout roster](03-scouts.md) | active |
| 04 | [Leader roster](04-leaders.md) | active |
| 05 | [Bank accounts](05-bank-accounts.md) | active |
| 06 | [Transactions & the ledger](06-transactions-ledger.md) | active |
| 07 | [Events (cost splits, payments, refunds)](07-events.md) | active |
| 08 | [Event finalization (estimate→actual true-up)](08-event-finalization.md) | active |
| 09 | [Dues (cycles, entries, partial payments)](09-dues.md) | active |
| 10 | [Dashboard](10-dashboard.md) | active |
| 11 | [Reports](11-reports.md) | active |
| 12 | [CSV import (roster)](12-csv-import.md) | active |
| 13 | [Backup & restore](13-backup-restore.md) | active |
| 14 | [Scout → leader conversion](14-scout-to-leader-conversion.md) | active |
| 15 | [Web frontend](15-web-frontend.md) | active |
| 16 | [Docker deployment & boot sequence](16-docker-deployment.md) | active |

## Testing (for this document)

- Spec index links resolve to existing files with matching numbers.
- All non-00 specs carry frontmatter with `description` + `status: active`.
- Key invariants section matches `AGENTS.md` and the code.

## Acceptance Criteria

- [ ] `specs/00-project-overview.md` exists and links every numbered spec.
- [ ] Repository layout, commands, and environment table match the code.
- [ ] Spec conventions match the project's spec-driven workflow rules.

## Open Questions

None. (Overview document; feature questions live in the individual specs.)
