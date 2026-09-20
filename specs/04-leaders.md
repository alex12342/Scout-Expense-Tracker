---
description: Leader (adult volunteer) roster CRUD, per-leader ledger and dues breakdown.
status: active
---

# 04 — Leader Roster

Leaders are adult volunteers — a full parallel of scouts: roster, ledger,
dues, and event participation.

Code: `artifacts/api-server/src/routes/leaders.ts`,
`lib/db/src/schema/leaders.ts`.

## Schema (`leaders`)

| Column | Type | Notes |
|---|---|---|
| `name` | varchar 128, not null, default `""` | legacy combined name, kept in sync by API |
| `firstName` | varchar 128, not null, default `""` | |
| `lastName` | varchar 128, not null, default `""` | |
| `position` | varchar 64, nullable | e.g. "Scoutmaster", "Committee Chair" (free text on the roster; the conversion endpoint constrains it to a known set — see `14-scout-to-leader-conversion.md`) |
| `duesAmountOverrideCents` | integer, nullable | per-leader dues rate override; `null` = cycle default (see `02-data-model.md` open question — no API/UI writer yet) |
| `isActive` | bool, default true | |

## Endpoints (all require auth)

| Method & path | Behavior |
|---|---|
| `GET /api/leaders` | All leaders ordered by `name`, each with computed `balanceCents`. |
| `POST /api/leaders` | Create. `firstName` required; `position`, `lastName` optional; `isActive` default true. 201. |
| `GET /api/leaders/:id` | Leader + `balanceCents` + `duesBreakdown {assessedCents, paidCents, remainingCents}` (assessed = SUM(dues.amountCents) for leader; paid = SUM(`dues_payment` where leaderId); remaining = max(0, assessed − paid)). |
| `GET /api/leaders/:id/ledger` | `{balanceCents, entries[]}` — chronological transactions (desc). |
| `PATCH /api/leaders/:id` | Partial update; re-derives `name`. |
| `DELETE /api/leaders/:id` | Hard delete, **blocked with 409** if the leader has any transactions or event participation. |

## Invariants

- Leaders participate in the same ledger semantics as scouts:
  `transactions.leader_id`, balance = SUM of their rows.
- Deletion guarded the same way as scouts — deactivate instead.

## Configuration

| Property | Default | Notes |
|---|---|---|
| `position` | free text, max 64 | no DB CHECK constraint on `leaders.position` |

## Testing

- CRUD parity with scouts: list with balances, detail with dues breakdown,
  ledger endpoint, name re-derivation on update.
- Delete with history → 409; without → 200.
- A leader's `dues_payment` transactions count toward their `duesBreakdown.paidCents`.

## Acceptance Criteria

- [ ] `GET /leaders` returns every leader with computed `balanceCents`.
- [ ] `GET /leaders/:id` exposes balance and assessed/paid/remaining dues.
- [ ] `DELETE` is blocked (409) while financial history exists.
- [ ] Leaders appear in the shared ledger, dashboard, events, and dues flows.

## Open Questions

None.
