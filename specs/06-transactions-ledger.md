---
description: The single transactions ledger — signed cents, type vocabulary, manual entry CRUD, and immutability rules.
status: active
---

# 06 — Transactions & the Ledger

**One `transactions` table is the entire money ledger**, shared by scouts,
leaders, bank accounts, and events. Amounts are **signed integer cents from
the troop's perspective**: positive = money in, negative = money out.
Balances are always computed with `SUM(amount_cents)`; nothing is stored.

Code: `artifacts/api-server/src/routes/ledger.ts`,
`lib/db/src/schema/transactions.ts`.

## Schema (`transactions`)

| Column | Type | Notes |
|---|---|---|
| `type` | varchar 40, not null | one of `TRANSACTION_TYPES` (see `02-data-model.md`) |
| `amountCents` | integer, not null | signed |
| `scoutId` | UUID, nullable | `ON DELETE SET NULL` |
| `leaderId` | UUID, nullable | `ON DELETE SET NULL` |
| `bankAccountId` | UUID, nullable | `ON DELETE SET NULL` |
| `eventId` | UUID, nullable | `ON DELETE SET NULL` |
| `eventParticipantId` | UUID, nullable | `ON DELETE CASCADE` |
| `referenceNumber` | varchar 128, nullable | check/cash/transfer reference |
| `note` | varchar 512, nullable | |
| `occurredAt` | timestamp, not null | default now |
| `createdBy` | UUID, nullable | user id |
| `createdAt`, `updatedAt` | timestamps | |

## Type vocabulary & sign convention

| Type | Sign | Written by |
|---|---|---|
| `opening_balance` | + | account create (`05-bank-accounts.md`) |
| `scout_deposit` | + | manual, event auto-credit, dues `apply-deposit` remainder |
| `reimbursement` | − | manual (troop reimburses a member) |
| `event_allocation` | − | event create / `update-costs` deltas — **system-only** |
| `event_payment` | + | `POST /events/:id/payments` — **system-only** |
| `event_refund` | − | `POST /events/:id/refunds` — **system-only** |
| `event_true_up` | ± | event finalization deltas — **system-only** |
| `bank_expense` | − | manual |
| `bank_adjustment` | ± | manual |
| `scout_adjustment` | ± | manual |
| `dues_payment` | + | dues `record-payment` — **system-only** |
| `dues_refund` | − | reserved (dues refund flow) |
| `dues_assessed` | − | dues `add-members` — **system-only** |

**Allowed to be created manually via the API** (`MANUAL_TYPES` in
`routes/ledger.ts`): `opening_balance`, `scout_deposit`, `reimbursement`,
`bank_expense`, `bank_adjustment`, `scout_adjustment`.

## Endpoints (all require auth)

| Method & path | Behavior |
|---|---|
| `GET /api/ledger` | Filterable list (desc). Filters: `scoutId`, `leaderId`, `bankAccountId`, `type`, `from`/`to` (date on `occurredAt`), `limit` (1–1000, default 100), `offset`. Joins scout/leader/bank/event names. |
| `POST /api/ledger` | Create a **manual** transaction. `type` must be in `MANUAL_TYPES` (400 otherwise). Sign is enforced per type: `scout_deposit` → `abs`, `reimbursement`/`bank_expense` → `−abs`, `opening_balance`/`bank_adjustment`/`scout_adjustment` → as given (0 rejected, 400). Requires a scout or leader (`scout_deposit`, `reimbursement`) or a bank account (the rest). `occurredAt` defaults to now; `createdBy` = actor. 201. |
| `PATCH /api/ledger/:id` | Partial update of amount/note/reference/occurredAt/bankAccountId. **409** for `event_allocation`, `event_payment`, `event_refund`, `event_true_up` ("Event transactions are immutable"). |
| `DELETE /api/ledger/:id` | **409** for the same system-owned types; otherwise hard delete. |

## Invariants (do not break)

1. System-owned event/dues rows (`event_*`, `dues_*`) are **only ever written
   by their owning route** and are immutable from the ledger endpoints.
2. Amounts are integer cents; `0` is never accepted for manual entries.
3. Balances are computed, never stored — deleting a member nulls their FKs
   and preserves history.
4. **Express route ordering**: in any router, register specific paths
   (`/waive`, `/bulk-toggle`, …) before `/:id` catch-alls, or they are shadowed.

## Configuration

| Property | Default | Notes |
|---|---|---|
| `limit` max | `1000` | `GET /ledger` |
| `MANUAL_TYPES` | see table | `routes/ledger.ts` |

## Testing

- POST with a system-owned type (`event_payment`) → 400.
- `scout_deposit` stores a positive amount regardless of input sign;
  `reimbursement` stores negative.
- `amountCents: 0` → 400.
- `scout_deposit` without scout/leader → 400; `bank_expense` without bank
  account → 400.
- PATCH/DELETE on `event_allocation` / `event_true_up` rows → 409.
- Filter combinations (member + date range + type) return correct rows.

## Acceptance Criteria

- [ ] All troop money movement is expressible as rows in one table with a
      single sign convention.
- [ ] Manual creation accepts only `MANUAL_TYPES` with enforced signs.
- [ ] Event/dues system rows cannot be mutated or deleted through the ledger.
- [ ] Every balance surfaced anywhere is `SUM(amount_cents)`.

## Open Questions

None.
