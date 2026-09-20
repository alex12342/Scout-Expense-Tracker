---
description: Dashboard snapshot — account balances, member credits/debts, event and dues outstanding.
status: active
---

# 10 — Dashboard

A single read endpoint aggregating the troop's financial position for the
landing page.

Code: `artifacts/api-server/src/routes/dashboard.ts`.

## Endpoint

`GET /api/dashboard` (auth required)

Returns:

| Field | Meaning |
|---|---|
| `accounts[]` | `bank_accounts` with computed `balanceCents`, ordered by name |
| `scouts[]` | active scouts with `balanceCents` and a `duesBreakdown` |
| `leaders[]` | active leaders with `balanceCents` and a `duesBreakdown` |
| `events[]` | events with `participantCount`, `totalPaidCents`, `totalOutstandingCents`, `isPaid` (outstanding == 0), `eventDate` |
| `duesSummary` | per-cycle outstanding (honoring partial payments, excluding waived) |
| `totals` | aggregate rollups (below) |

## Totals

| Field | Definition |
|---|---|
| `bankTotalCents` | Σ account balances |
| `checkingTotalCents` / `savingsTotalCents` | per `accountType` |
| `creditsCents` | Σ positive member balances (troop owes them) |
| `debtsCents` | Σ |negative| member balances + dues outstanding (they owe the troop) |
| `eventsOutstandingCents` | Σ event outstanding |
| `duesOutstandingCents` | Σ dues outstanding (waived excluded, `LEAST(amount, paidToDate)` applied) |
| `totalOwedToTroopCents` | `debtsCents` (members' ledger debits + dues outstanding) |

## Rules

- Dues outstanding uses the same partial-payment rule as `09-dues.md`:
  `paid = LEAST(amountCents, paidToDateCents)`, waived entries excluded.
- A member's ledger balance: positive = troop owes them (credit), negative =
  they owe the troop (debt).
- Event `isPaid` = `totalOutstandingCents === 0`.

## Configuration

| Property | Default | Notes |
|---|---|---|
| roster scope | `isActive = true` | dashboard lists active members |

## Testing

- Empty DB: all arrays empty, all totals 0, no errors.
- Account with opening balance + expense → totals reflect the net.
- Scout with −$50 balance and $30 unpaid dues → `debtsCents` includes 80.
- Scout fully paid on dues (partial-payment path) → `duesOutstandingCents` 0.
- Event fully paid → `isPaid` true, outstanding 0.
- Inactive scout/leader excluded from roster arrays.

## Acceptance Criteria

- [ ] One call returns everything the landing page needs (accounts, members,
      events, dues, totals).
- [ ] Dues outstanding honors partial payments and waivers.
- [ ] Credits and debts partition member balances by sign correctly.
- [ ] Event `isPaid` derives from outstanding, not a stored flag.

## Open Questions

None.
