---
description: Events with line-item cost splits, per-participant allocations, payments, refunds, and cost-change auditing.
status: active
---

# 07 — Events (Cost Splits, Payments, Refunds)

An event has a set of cost line items and a set of participating scouts/
leaders. On creation (and on cost edits) the total is split across
participants, producing signed `event_allocation` ledger rows. Payments and
refunds are recorded per participant. Event allocation rows are **immutable**
— corrections are deltas, not edits.

Code: `artifacts/api-server/src/routes/events.ts` (largest route file),
`lib/db/src/schema/events.ts`.

## Schema

- `events`: `name`, `eventDate` (date, string mode), `description`,
  `totalCostCents`, `status` (`active` | `finalized`, default `active`),
  `fields` (jsonb `EventField[]` — optional metadata), timestamps.
- `event_participants`: `eventId` (cascade), `scoutId` XOR `leaderId`
  (CHECK), `amountAllocatedCents` (current share),
  `estimatedAllocatedCents` (share at creation, kept for finalization),
  `amountPaidCents` (payments − refunds), `status`
  (`registered` | `dropped_full_refund` | `dropped_fee_assessed` |
  `attended`, default `registered`), `isManualOverride` (bool),
  `overrideAmountCents` (nullable). Partial unique indexes on
  (event, scout) and (event, leader).
- `event_line_items`: `eventId` (cascade), `name`, `amountCents`,
  `participantTypes` (text[] ⊆ `scout`/`leader`/`everyone`), `isEstimated`.
- `event_cost_changes`: `eventId` (cascade), `action`
  (`add_line` | `remove_line` | `update_line` | `update_total`),
  `lineName`, `oldAmountCents`/`newAmountCents`, `oldTotalCents`/
  `newTotalCents`, `userId`, `note`. **Audit log — excluded from backup/restore
  and never modified.**

## Endpoints (all require auth)

### `GET /api/events`
List with aggregates per event: `participantCount`, `totalPaidCents`,
`totalOutstandingCents`, `eventDate`, `status`. Desc by date.

### `POST /api/events`
Create. Body: `name`, `eventDate`, optional `description`, `lineItems[]`
(≥ 1, each `name` + `amountCents` > 0, `participantTypes` default `["everyone"]`,
`isEstimated` default true), `participants[]` (≥ 1, each `scoutId` XOR
`leaderId`, duplicate member rejected 400).

Within one transaction:
1. Insert event (`totalCostCents` = Σ line items).
2. Even-split: for each participant, `share = Σ items where the participant
   qualifies` (`everyone` always qualifies). Rounding: integer division;
   remainder cents distributed one cent at a time across participants so the
   split exactly equals the total.
3. Insert participants with `amountAllocatedCents` =
   `estimatedAllocatedCents` = share.
4. Write one `event_allocation` transaction (−share) per participant, linked
   to event + participant.
5. **Auto-credit**: if a participant's ledger balance is positive (troop owes
   them), apply it against their share: write a `scout_deposit` (+credit) and
   reduce their outstanding; the credit is capped at the share.

### `GET /api/events/:id`
Event + participants (each with `scoutName`/`leaderName`, allocated, paid,
outstanding, `status`, override fields) + line items + cost changes + payment
history.

### `PATCH /api/events/:id`
Update `name`/`eventDate`/`description`/`fields` (no cost changes).

### `PATCH /api/events/:id/update-costs`
Replace the line-item set. Within one transaction:
1. Diff line items (add/remove/update by index order).
2. Recompute the even split across existing participants (respecting
   `participantTypes`).
3. For each participant, `delta = newShare − currentAllocated`; if non-zero,
   write an `event_allocation` delta row (signed) and update
   `amountAllocatedCents`.
4. Record `event_cost_changes` rows (`add_line`/`remove_line`/`update_line`)
   with the actor and old/new values.
5. Update `events.totalCostCents`.

### `POST /api/events/:id/payments`
`{participantId, amountCents, bankAccountId, note}`. Writes `event_payment`
(+), caps at the participant's outstanding (400 if over), bumps
`amountPaidCents`.

### `POST /api/events/:id/refunds`
`{participantId, amountCents, bankAccountId, note}`. Writes `event_refund`
(−), capped at `amountPaidCents` (400 if over), decrements `amountPaidCents`.

### `DELETE /api/events/:id`
**Blocked with 409** if any `event_payment` exists ("Record refunds first").
Otherwise cascades participants/line items/cost changes and deletes the
event's `event_allocation` rows.

## Invariants

- `event_allocation` rows are never updated — only new delta rows.
- Σ `amountAllocatedCents` across participants always equals
  `events.totalCostCents` (after create/update-costs, ignoring finalization
  overrides — see `08-event-finalization.md`).
- Payments/refunds never go negative and never exceed their caps.
- Event rows referenced by transactions survive member deletion (FK SET NULL).

## Configuration

| Property | Default | Notes |
|---|---|---|
| `lineItems` | required ≥ 1, `amountCents` > 0 | `POST /events` |
| `participants` | required ≥ 1, scout XOR leader | duplicates rejected |
| split algorithm | even split by qualifying line items | remainder cents distributed 1¢ at a time |

## Testing

- Create: split sums exactly to the total (including odd-cent remainders);
  each participant gets one `event_allocation` row (−share).
- Auto-credit: participant with +$20 balance and $50 share → $20
  `scout_deposit` written, outstanding reduced.
- `update-costs`: delta allocations written (not edits); cost-change audit
  rows present with actor; total updated.
- Payment cap: overpayment → 400; exact outstanding → 200, outstanding 0.
- Refund cap: refund > paid → 400.
- Delete with payments → 409; without → 200 and allocations removed.
- `GET /events` aggregates match per-participant sums.

## Acceptance Criteria

- [ ] Creating an event produces a complete, exactly-summing allocation set.
- [ ] Cost edits produce signed delta allocations plus an audit trail.
- [ ] Payments/refunds are capped and per-participant.
- [ ] Allocation rows are immutable via the ledger endpoints.
- [ ] Event deletion is blocked while payments exist.

## Open Questions

None.
