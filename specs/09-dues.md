---
description: Dues cycles and per-member obligations with partial payments, deposits, waivers, and an audit trail.
status: active
---

# 09 — Dues (Cycles, Entries, Partial Payments)

Dues are a **tracker layered on top of the ledger**: cycles (periods) define
a rate for scouts and leaders; entries record each member's obligation;
payments/refunds flow through the ledger as `dues_payment`/`dues_refund`
rows, with every state change journaled in `dues_transactions`.

Code: `artifacts/api-server/src/routes/dues.ts` (second-largest route file),
`lib/db/src/schema/dues.ts`.

## Schema

- `dues_cycles`: `label` (unique), `scoutAmountCents`,
  `leaderAmountCents`, `isCurrent` (at most **one** cycle true),
  `bankAccountId` (nullable, where dues payments land), timestamps.
- `dues`: `cycleId` (cascade), `memberType` (`scout` | `leader`),
  `memberId` (nullable UUID, no FK — validated in API), `amountCents`,
  `isPaid` (default false), `isWaived` (default false), `paidAt` (nullable),
  `dueDate` (nullable date, string mode), `notes`, timestamps.
  Unique per (cycle, memberType, member).
- `dues_transactions`: `duesId` (cascade), `action` (free-form string:
  `created`, `payment`, `partial_payment`, `payment_recorded`, `waived`,
  `unwaived`, `toggled`, `deleted`, …), `userId` (nullable),
  `amountCents` (snapshot), `isPaid`/`isWaived` (snapshots),
  `transactionId` (nullable ledger FK ref), `note`, `createdAt`.

## Payment state (partial payments)

- `DUES_PAYMENT_ACTIONS = ("payment", "payment_recorded", "partial_payment")`
  — these `dues_transactions` rows count toward **paid-to-date**.
- `paidToDateCents(duesId) = COALESCE(SUM(amount_cents) of those actions, 0)`.
- **Display rule**: `paid = LEAST(amountCents, paidToDateCents)`;
  `remaining = max(0, amount − paid)`; waived entries report paid = amount.
- **Status derivation** (per entry): `waived` → `paid` (isPaid or fully
  covered) → `partial` (0 < paid < amount) → `overdue` (dueDate < today) →
  `unpaid`.
- An entry flips to `isPaid = true` (with `paidAt`) the moment cumulative
  coverage reaches the full amount.

## Endpoints (all require auth)

### Cycles
| Method & path | Behavior |
|---|---|
| `GET /api/dues/cycles` | All cycles desc, each with counts (members, paid, waived) and amounts. |
| `POST /api/dues/cycles` | Create. `label` required unique (409); `scoutAmountCents`/`leaderAmountCents` ≥ 0; `isCurrent` default false; setting `isCurrent=true` clears it on other cycles. |
| `GET /api/dues/cycles/:id` | Cycle + `duesCount`, `paidCount`, `waivedCount`. |
| `PATCH /api/dues/cycles/:id` | Update label/amounts/isCurrent/bankAccountId (isCurrent exclusivity enforced). |
| `DELETE /api/dues/cycles/:id` | Cascade-deletes entries + audit; 409 if the cycle has any `dues_payment` ledger rows ("Payments exist — void or delete them first"). |

### Entries
| Method & path | Behavior |
|---|---|
| `GET /api/dues/cycles/:cycleId` | Entries for a cycle with member name joined, payment state (paidToDate, paid, remaining, derived status), ordered by name. |
| `POST /api/dues/cycles/:cycleId/dues` | Create entry for one member (`memberType` + `memberId`, `amountCents` defaults to the cycle rate for that member type, `dueDate`, `notes`). 409 if the member already has an entry in the cycle. Audit `created`. |
| `PATCH /api/dues/:id` | Update `amountCents`/`dueDate`/`notes`; flipping to paid sets `paidAt`; audit row. |
| `DELETE /api/dues/:id` | Delete entry (and its audit); 409 if it has `dues_payment` ledger rows. |
| `POST /api/dues/bulk-toggle` | `{ids[], isPaid}` — set paid state on many entries (must come before `/:id` routes). |
| `POST /api/dues/bulk-mark-paid` | `{ids[]}` — mark paid (paidAt=now). |
| `GET /api/dues/:id/history` | Audit trail desc. |

### Waive / toggle
| Method & path | Behavior |
|---|---|
| `POST /api/dues/:id/waive` | `{waived: bool}` — set `isWaived`; waived entries are excluded from outstanding totals; audit. |
| `POST /api/dues/:id/toggle` | Flip `isPaid`; when marking paid, set `paidAt`; when unmarking, clear `paidAt`; audit. |

### Payments (ledger-backed)
| Method & path | Behavior |
|---|---|
| `POST /api/dues/:id/record-payment` | `{amountCents, bankAccountId?, note?}`. Writes a `dues_payment` (+amount) ledger row, appends a `dues_transactions` audit (`partial_payment`/`payment`), and flips `isPaid=true`+`paidAt` once cumulative coverage reaches the full amount. 400 if `amountCents ≤ 0` or exceeds the remaining. |
| `POST /api/dues/apply-deposit` | `{memberType, memberId, amountCents, bankAccountId}`. Applies a deposit to the member's oldest outstanding dues entries first (FIFO), writing `dues_payment` rows per entry capped at each entry's remaining; any leftover becomes a `scout_deposit`/`reimbursement`-style ledger credit. Audit per entry. |

### Retroactive membership & generation
| Method & path | Behavior |
|---|---|
| `POST /api/dues/cycles/:cycleId/add-members` | `{members[]}` — create entries for members who don't yet have one (skips existing), at the cycle rate; writes a `dues_assessed` (−amount) ledger row per created entry. |
| `POST /api/dues/cycles/:cycleId/generate` | **Regenerate all** entries for the cycle from active scouts + active leaders: deletes existing entries **without** ledger payments, creates one per active member (honoring `duesAmountOverrideCents` when set, else the cycle rate), writes `dues_assessed` rows. 409 if any existing entry has `dues_payment` rows. |

### Reports
| Method & path | Behavior |
|---|---|
| `GET /api/dues/cycles/:cycleId/breakdown` | Per-entry rows: member name, amount, paid, remaining, status, waived. |
| `GET /api/dues/reports/summary` | Cross-cycle summary: per cycle — total members, paid count, outstanding cents (honoring the `LEAST(amount, paidToDate)` rule and excluding waived). |

## Invariants

- At most one `isCurrent` cycle.
- Dues entries are unique per (cycle, memberType, member).
- `dues_payment` ledger rows are immutable (see `06-transactions-ledger.md`).
- Every entry state change appends to `dues_transactions` (audit is
  append-only, cascade-deleted with the entry).
- Boot backfill flips legacy fully-covered entries to `isPaid=true`
  (see `16-docker-deployment.md`).

## Configuration

| Property | Default | Notes |
|---|---|---|
| `DUES_PAYMENT_ACTIONS` | `payment`, `payment_recorded`, `partial_payment` | which audit rows count as paid |
| cycle `isCurrent` | at most one | enforced in routes |
| override rate | `duesAmountOverrideCents` (nullable per member) | `generate` honors it; no API/UI writer yet (see `02-data-model.md`) |

## Testing

- Generate: one entry per active scout/leader, amounts = cycle rate (or
  override); `dues_assessed` ledger rows written; re-generate blocked (409)
  once payments exist.
- `record-payment` partial: `paidToDate` accumulates across payments; entry
  flips to `isPaid` exactly when coverage ≥ amount; overpay → 400.
- `apply-deposit` FIFO: oldest entries drained first; leftover becomes a
  ledger credit row.
- `waive`: waived entries drop out of outstanding totals everywhere
  (breakdown, reports/summary, dashboard).
- Status derivation order (waived > paid > partial > overdue > unpaid).
- Bulk endpoints operate on the exact id set passed.
- Cycle delete with payments → 409; without → cascades.

## Acceptance Criteria

- [ ] A cycle defines separate scout/leader rates and at most one is current.
- [ ] Partial payments accumulate correctly and flip the entry to paid at
      full coverage.
- [ ] Deposits apply FIFO across a member's outstanding entries.
- [ ] Every state change is journaled in `dues_transactions`.
- [ ] Outstanding totals honor `LEAST(amount, paidToDate)` and exclude waived.

## Open Questions

- `duesAmountOverrideCents` is honored by `generate` but has **no API/UI
  writer** (absent from the scout/leader zod schemas). Resolved for now as a
  database-level knob; expose it in a spec amendment before UI work.
