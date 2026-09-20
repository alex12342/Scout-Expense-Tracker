---
description: Event finalization — converting estimates to actuals with per-participant attendance status, overrides, and event_true_up true-up rows.
status: active
---

# 08 — Event Finalization (Estimate→Actual True-Up)

Events are created with **estimated** costs and even splits. Finalization
converts the event to actuals: each participant gets an attendance status
and/or a manual cost override, the remainder is re-split, and the difference
between each participant's estimated share and their final share is written
as a signed `event_true_up` ledger row. The event is then locked as
`finalized`.

Code: `routes/events.ts` (`POST /:id/finalize`),
frontend `artifacts/web/src/pages/EventDetailPage.tsx` (Finalize dialog).

## Endpoint

`POST /api/events/:id/finalize` (auth required)

Body:
```json
{
  "actualTotalCents": 12345,        // defaults to the estimated total if omitted
  "participants": [
    {
      "participantId": "uuid",
      "status": "attended",          // registered | dropped_full_refund | dropped_fee_assessed | attended
      "isManualOverride": true,      // optional
      "overrideAmountCents": 5000    // required when isManualOverride
    }
  ]
}
```

## Algorithm (single DB transaction)

1. **Guard**: event must exist; re-finalization of a `finalized` event → 409.
2. **Bearers** (who ultimately pay):
   - `attended` (default; `registered` is promoted to `attended`)
   - `dropped_fee_assessed` (dropped but still owes their share)
   - `dropped_full_refund` → final share forced to **0** (excluded)
3. **Manual overrides**: participants with `isManualOverride` get exactly
   `overrideAmountCents` (must be ≥ 0).
4. **Remainder split**: `remainder = actualTotalCents − Σ overrideShares`;
   split evenly (integer) across the **non-override bearers** (attended +
   dropped_fee_assessed), remainder cents distributed 1¢ at a time. If there
   are no non-override bearers, the remainder stays unassigned (overrides
   already total the actual).
5. **True-up rows**: for each participant,
   `delta = estimatedAllocatedCents − finalShare`; when non-zero, insert an
   `event_true_up` transaction (signed: **negative = participant owes more**,
   **positive = participant gets a credit**), linked to event + participant.
   `event_allocation` rows are **never updated**.
6. **Persist**: `amountAllocatedCents` = finalShare, `status` set,
   `isManualOverride`/`overrideAmountCents` stored; event `status` =
   `finalized`, `totalCostCents` = actualTotalCents.

## Consequences

- The ledger is the only source of truth after finalization:
  - participant's event balance = `event_allocation` (estimates, −)
    + `event_payment` (+) + `event_refund` (−) + `event_true_up` (±).
- `event_true_up` rows are **immutable** — blocked by
  `PATCH`/`DELETE /api/ledger/:id` (409, alongside the other event types).
- A finalized event cannot be re-finalized (409), cost-edited, or have
  payments/refunds recorded against changed shares — the UI hides those
  actions when `status === "finalized"`.

## Frontend behavior

- `EventDetailPage` shows a **Finalize** action only while `status === "active"`.
- Finalize dialog: per-participant status `Select`, "Custom cost" `Switch` +
  amount `Input`, an "Actual total" `Input` (defaults to the estimate), and a
  live **final/true-up preview** per participant.
- After finalization: **Finalized** badge, "Actual Total" stat replaces the
  estimate, participant list shows status + final share.

## Configuration

| Property | Default | Notes |
|---|---|---|
| `actualTotalCents` | estimated `totalCostCents` | finalize body |
| default attendance | `registered` → `attended` | participants not listed keep their share |
| override validation | `overrideAmountCents` ≥ 0, required with override | 400 otherwise |

## Testing

- All-attended, no overrides, actual = estimate → **zero** true-up rows,
  event finalized.
- actual > estimate, no overrides → each bearer gets a negative (owes-more)
  true-up; sums equal `actual − estimate`.
- actual < estimate → positive (credit) true-ups.
- One `dropped_full_refund` → that participant's final share 0, positive
  true-up equals their full estimated share; others absorb the remainder.
- Manual override on 1 of N → override honored exactly; remainder split across
  the other bearers.
- Re-finalize → 409.
- `PATCH`/`DELETE /ledger/:id` on an `event_true_up` row → 409.
- Ledger balance after finalization: allocation + payments + true-up sums to
  the expected net per participant.

## Acceptance Criteria

- [ ] Finalization writes only `event_true_up` rows (no allocation edits).
- [ ] True-up signs are consistent: negative = owes more, positive = credit.
- [ ] `dropped_full_refund` participants end with a final share of 0.
- [ ] Manual overrides are exact and the remainder splits across other bearers.
- [ ] Finalized events are locked: no re-finalize, no further payments/refunds
      against changed shares.
- [ ] Frontend preview matches the algorithm before commit.

## Open Questions

- Whether `update-costs` should be blocked for finalized events (currently the
  route does not check status; the UI hides the action). Resolved for now as a
  UI-side guard; a spec amendment is needed if the API gains a server-side
  guard.
