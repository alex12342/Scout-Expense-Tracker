---
description: Database schema conventions, table inventory, money/timestamp rules, and schema-sync strategy.
status: active
---

# 02 — Data Model & Persistence Conventions

PostgreSQL 15 (embedded in the container) accessed via Drizzle ORM
(`drizzle-orm` 0.45.x) + `node-postgres`. Schema lives in `lib/db/src/schema/`;
a lazy singleton `db` (Proxy) defers pool creation until first query.

Code: `lib/db/src/index.ts`, `lib/db/src/schema/*`.

## Conventions

- **Primary keys**: client-generated-friendly UUIDv4 as text,
  `default sql\`(gen_random_uuid())\``, named `id` (shared `common.ts` helper).
- **Audit timestamps**: `created_at`/`updated_at` timestamptz, default now,
  shared helpers.
- **Money**: integer **cents** (`integer`, `notNull`, default 0 where a money
  default makes sense). API exposes `*_cents`; UI formats to dollars. No
  floating point anywhere in the money path.
- **Member identity**: `scouts` and `leaders` are parallel tables. Anything
  money-related references both: `transactions.scout_id` /
  `transactions.leader_id`; `event_participants` enforces exactly-one via
  CHECK `(scout_id IS NOT NULL) <> (leader_id IS NOT NULL)`.
- **FK behavior**:
  - `transactions.*` (scout/leader/bank/event/participant) → `ON DELETE SET NULL`
    (financial history survives member deletion).
  - `event_participants.event_id`, `event_line_items.event_id`,
    `event_cost_changes.event_id`, `dues.cycle_id`,
    `dues_transactions.dues_id` → `ON DELETE CASCADE`.
  - `dues.member_id` is a plain nullable UUID (polymorphic on
    `member_type`), no FK — validated at the API layer.

## Table inventory

| Table | Purpose | Key columns |
|---|---|---|
| `users` | app accounts | username (unique), passwordHash, role, isActive |
| `scouts` | roster | name (legacy combined), firstName, lastName, bsaNumber (unique), rank, age, duesAmountOverrideCents, isActive |
| `leaders` | roster | name, firstName, lastName, position, duesAmountOverrideCents, isActive |
| `bank_accounts` | troop accounts | name, accountType (`checking`\|`savings`), last4 (4 digits, display only) |
| `events` | troop events | name, eventDate (date, string mode), totalCostCents, status (`active`\|`finalized`), fields (jsonb `EventField[]`) |
| `event_participants` | per-event member shares | scoutId XOR leaderId, amountAllocatedCents, estimatedAllocatedCents, amountPaidCents, status, isManualOverride, overrideAmountCents; unique (event, scout) + partial unique (event, leader) |
| `event_line_items` | cost components | name, amountCents, participantTypes (`scout`\|`leader`\|`everyone` array), isEstimated |
| `event_cost_changes` | audit log of cost edits | action (`add_line`\|`remove_line`\|`update_line`\|`update_total`), old/new amounts, userId, note |
| `transactions` | the single money ledger | see `06-transactions-ledger.md` |
| `dues_cycles` | dues periods | label (unique), scoutAmountCents, leaderAmountCents, isCurrent (≤1 true), bankAccountId |
| `dues` | per-member obligations | cycleId, memberType (`scout`\|`leader`), memberId, amountCents, isPaid, isWaived, paidAt, dueDate (date string), notes; unique (cycle, memberType, member) |
| `dues_transactions` | dues audit trail | duesId, action, userId, amountCents (snapshot), isPaid/isWaived (snapshot), transactionId, note |

## Named constants (exported from `lib/db`)

- `TRANSACTION_TYPES`: `opening_balance`, `scout_deposit`, `reimbursement`,
  `event_allocation`, `event_payment`, `event_refund`, `event_true_up`,
  `bank_expense`, `bank_adjustment`, `scout_adjustment`, `dues_payment`,
  `dues_refund`, `dues_assessed`.
- `EVENT_STATUSES`: `active`, `finalized`.
- `EVENT_PARTICIPANT_STATUSES`: `registered`, `dropped_full_refund`,
  `dropped_fee_assessed`, `attended`.
- `EVENT_LINE_ITEM_PARTICIPANT_TYPES`: `scout`, `leader`, `everyone`.
- `DUES_MEMBER_TYPES`: `scout`, `leader`.

## Schema sync strategy (no migration files)

- **Drift is applied at boot**: `db-init.sh` runs
  `drizzle-kit push --force` against the live DB (the image ships a
  `pnpm deploy`'d copy of `lib/db` **with devDeps** at `/app/db` so
  drizzle-kit can run).
- `push` **adds** missing tables/columns but does not drop data.
- **One-time backfills** run idempotently in `db-init.sh` after the push:
  1. Split legacy `scouts.name` into `first_name`/`last_name` where empty.
  2. Flip fully-covered dues entries (`dues_transactions` payments sum ≥
     amount) to `is_paid = true` with `paid_at` backfilled from the last
     payment audit row.
- Drizzle helpers (`eq`, `and`, `count`, …) are imported from the
  `drizzle-orm` package directly in route files — `lib/db` re-exports only the
  schema, `db`, and `getPool`.

## Pool configuration

`pg.Pool`: `max: 20`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`,
`maxUses: 1000`, `allowExitOnIdle: false`; errors on idle clients are logged.

## Configuration

| Property | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@127.0.0.1:5432/scout_expense_tracker` | required at first query |
| `DB_NAME` | `scout_expense_tracker` | db-init.sh only |
| pool max | `20` | `lib/db/src/index.ts` |

## Testing

- Importing `lib/db` has no side effects (no pool created, no throw) until a
  query runs — `db` is a Proxy.
- `getPool()` throws a clear error when `DATABASE_URL` is unset.
- Schema push on an empty DB creates all 12 tables; push on an existing DB is
  additive (no data loss).
- Backfills: scout name split is a no-op when `first_name` is set; dues
  is_paid flip only applies to non-waived entries whose payments cover the full
  amount.
- CHECK constraint: inserting `event_participants` with both or neither
  scout/leader id fails.
- FK behavior: deleting a scout nulls `transactions.scout_id`; deleting an
  event cascades participants/line items/cost changes.

## Acceptance Criteria

- [ ] All tables above exist after a fresh boot with the documented columns.
- [ ] Money columns are integer cents; date columns in string mode
      (`eventDate`, `dueDate`) round-trip as `YYYY-MM-DD` strings.
- [ ] UUID primary keys default server-side via `gen_random_uuid()`.
- [ ] `drizzle-kit push --force` succeeds against both empty and populated DBs.
- [ ] Both backfills in `db-init.sh` are idempotent across reboots.

## Open Questions

- `duesAmountOverrideCents` exists on `scouts`/`leaders` and is honored by
  dues generation, but **no API route or UI currently sets it** (not in the
  scout/leader zod schemas). Resolved for now by documenting it as
  database-level configuration; a spec amendment is required before exposing
  it in the API/UI.
