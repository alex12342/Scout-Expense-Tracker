---
description: Troop bank accounts with opening balances and per-account transaction history.
status: active
---

# 05 — Bank Accounts

Bank accounts hold the troop's money. Opening balances are recorded as
`opening_balance` transactions so every account balance is a pure `SUM()`.

Code: `artifacts/api-server/src/routes/bank-accounts.ts`,
`lib/db/src/schema/bank-accounts.ts`.

## Schema (`bank_accounts`)

| Column | Type | Notes |
|---|---|---|
| `name` | varchar 128, not null | |
| `accountType` | varchar 16, not null | `checking` \| `savings` (API enforces) |
| `last4` | varchar 4, nullable | digits only, display only (never stored in full) |

## Endpoints (all require auth)

| Method & path | Behavior |
|---|---|
| `GET /api/bank-accounts` | All accounts ordered by `name`, each with `balanceCents` (SUM of its transactions). |
| `POST /api/bank-accounts` | Create. `accountType` must be `checking`\|`savings` (400 otherwise); `last4` digits-only (400); optional `openingBalanceDollars` (number ≥ 0) — when provided, writes one `opening_balance` transaction (+cents, `occurredAt` now) in the same response. 201 with `openingBalanceTransaction`. |
| `GET /api/bank-accounts/:id` | Account + `balanceCents`. 404 if missing. |
| `PATCH /api/bank-accounts/:id` | Partial update of `name`/`accountType`/`last4`. |
| `DELETE /api/bank-accounts/:id` | **Blocked with 409** if the account has any transactions ("Move or delete its transactions first"). |
| `GET /api/bank-accounts/:id/transactions` | Account + chronological (desc) transaction entries with joined names. |

## Invariants

- Balance is always computed: `COALESCE(SUM(amount_cents), 0)` — never stored.
- `last4` is the only identifier stored; full account numbers must never
  appear in the DB or API.
- Deleting an account with history is refused — the ledger is permanent.

## Configuration

| Property | Default | Notes |
|---|---|---|
| `accountType` allowed values | `checking`, `savings` | zod enum in `routes/bank-accounts.ts` |
| `last4` pattern | `^\d{0,4}$` | digits only |

## Testing

- Create with `openingBalanceDollars` → `opening_balance` transaction with
  amount = dollars × 100 (rounded), sign positive.
- `accountType` other than checking/savings → 400; non-digit `last4` → 400.
- Balance reflects all signed transactions (opening + expenses + reimbursements).
- Delete with transactions → 409, row survives; delete without → 200.

## Acceptance Criteria

- [ ] Every account lists with a computed `balanceCents`.
- [ ] Opening balance is captured as a ledger transaction, not a stored total.
- [ ] Account history endpoint joins and returns that account's transactions.
- [ ] Deletion is blocked while any transaction references the account.

## Open Questions

None.
