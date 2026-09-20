---
description: Report endpoints — transaction history and per-scout, per-leader, per-event, and dues summaries.
status: active
---

# 11 — Reports

Read-only reporting over the ledger and members. All endpoints are
auth-protected and filter by date range.

Code: `artifacts/api-server/src/routes/reports.ts`.

## Endpoint

`GET /api/reports` (auth required)

Query params:

| Param | Values / notes |
|---|---|
| `type` | `transactions` (default) \| `scout-summary` \| `leader-summary` \| `event-summary` \| `dues-summary` |
| `from` | ISO date, inclusive lower bound on `occurredAt`/`eventDate` |
| `to` | ISO date, inclusive upper bound |
| `limit` | 1–2000, default 200 (transactions only) |

## Report shapes

### `transactions`
`{rows: TransactionRow[]}` — ledger rows in range (desc) with joined
member/bank/event names, capped by `limit` (max **2000**).

### `scout-summary`
Per active scout: `name`, `bsaNumber`, `rank`, `balanceCents`,
`totalInCents` (Σ positive), `totalOutCents` (Σ |negative|),
`transactionCount`, plus dues: `duesAssessedCents`, `duesPaidCents`,
`duesOutstandingCents`.

### `leader-summary`
Same shape as scout-summary, per active leader (position instead of rank).

### `event-summary`
Per event in range: `name`, `eventDate`, `totalCostCents`,
`totalAllocatedCents`, `totalPaidCents`, `totalOutstandingCents`,
`participantCount`, `status`.

### `dues-summary`
Per cycle: `label`, `scoutCount`, `leaderCount`, `scoutOutstandingCents`,
`leaderOutstandingCents`, `totalOutstandingCents` — honoring the
`LEAST(amount, paidToDate)` rule and excluding waived (see `09-dues.md`).

## Invariants

- Reports are **read-only**; no writes of any kind.
- All amounts integer cents.
- Date filters are inclusive on both ends.
- Transaction report is hard-capped at 2000 rows (clients page with `limit`/
  re-ranges, not offsets).

## Configuration

| Property | Default | Notes |
|---|---|---|
| `limit` max (transactions) | `2000` | hard cap in `routes/reports.ts` |
| default `type` | `transactions` | |

## Testing

- Each of the 5 report types returns a 200 with the documented shape.
- `from`/`to` inclusive on both ends (row on the boundary is included).
- `limit=2000` returns ≤ 2000 rows; `limit>2000` → 400.
- scout-summary `totalIn/Out` partition all of the scout's transactions.
- dues-summary outstanding matches the `09-dues.md` rule (partial + waived).
- Unknown `type` → 400 with the list of valid types.

## Acceptance Criteria

- [ ] All five report types are available and correctly shaped.
- [ ] Date filtering is inclusive and consistent across types.
- [ ] Transaction output is bounded (≤ 2000 rows).
- [ ] Dues summary honors partial payments and waivers.

## Open Questions

None.
