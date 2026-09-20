---
description: Convert a scout to a leader — transfer their transactions and event participation, deactivate the scout.
status: active
---

# 14 — Scout → Leader Conversion

A scout who becomes an adult leader keeps their full financial history: their
transactions and event participation are **transferred** to a new leader row,
and the original scout is **deactivated** (not deleted).

Code: `artifacts/api-server/src/routes/scouts.ts`
(`POST /:id/convert-to-leader`),
frontend `ScoutDetailPage` ("Convert to Leader" action).

> Note: `artifacts/api-server/src/routes/convert.ts` exists in the tree but is
> **not registered** in `routes/index.ts` — the live endpoint is the one in
> `scouts.ts`. (See Open Questions.)

## Endpoint

`POST /api/scouts/:id/convert-to-leader` (auth required)

Body: `{ "position": "den_chief" }` (optional; default `den_chief`)

Allowed `position` values: `assistant_leader`, `tight_leader`, `den_chief`,
`committee_chair`, `treasurer`, `secretary`, `other`.

## Behavior (single DB transaction)

1. Load the scout; **400** if the scout is not active ("Only active scouts can
   be converted").
2. Create a leader with `firstName`, `lastName`, `position` (scout's
   first/last name carried over; `duesAmountOverrideCents` is **not** carried
   over — the new leader starts at the default cycle rate).
3. **Transfer transactions**: every `transactions` row with
   `scout_id = scout.id` is updated to `scout_id = NULL, leader_id = newLeader.id`
   (preserving type, amount, bank/event links).
4. **Transfer event participation**: every `event_participants` row with
   `scout_id = scout.id` is updated to `scout_id = NULL, leader_id = newLeader.id`
   (amounts and payment state preserved).
5. **Deactivate the scout**: `isActive = false` (row kept for audit).
6. Return the new leader (201).

## Consequences

- The leader's balance equals the scout's prior balance (SUM is preserved —
  only the member FK moves).
- Event shares and `event_payment`/`event_true_up` rows keep pointing at the
  same `event_participants` row (which now references the leader).
- Dues entries for the scout are **left as-is** (they are a per-cycle record
  of what the scout owed); the leader is a fresh member for future cycles.
- The deactivated scout still appears in ledgers/reports with their
  (now-empty) history.

## Invariants

- Conversion is one-shot and transactional — no partial transfer.
- History is preserved, never deleted.
- The scout row is never deleted by conversion.

## Configuration

| Property | Default | Notes |
|---|---|---|
| `position` | `den_chief` | one of the 7 allowed values |
| scout state | must be `isActive = true` | 400 otherwise |

## Testing

- Convert an active scout with transactions + event participation →
  transactions re-pointed to the leader, event participant rows re-pointed,
  scout deactivated, leader balance == scout's prior balance.
- Convert an inactive scout → 400, nothing changed.
- Invalid `position` → 400.
- Dues history for the scout is unchanged after conversion.
- Idempotency: a second conversion of the same (now-inactive) scout → 400.

## Acceptance Criteria

- [ ] Conversion transfers all transactions and event participation to the
      new leader without loss.
- [ ] The scout is deactivated (row preserved), the leader is created 201.
- [ ] Balances are continuous across the conversion.
- [ ] The operation is atomic.

## Open Questions

- `routes/convert.ts` (standalone `POST /:id/convert-to-leader` router) is
  **orphaned** — not mounted in `routes/index.ts`. Resolved for now as dead
  code documenting an older design; either delete it or wire it up in a
  future amendment.
