---
description: Scout roster CRUD, per-scout ledger and dues breakdown, and deletion guards.
status: active
---

# 03 — Scout Roster

Scouts are troop members with a personal ledger (via `transactions.scout_id`)
and dues obligations. `leaders` is a full parallel (see `04-leaders.md`).

Code: `artifacts/api-server/src/routes/scouts.ts`,
`lib/db/src/schema/scouts.ts`.

## Schema (`scouts`)

| Column | Type | Notes |
|---|---|---|
| `name` | varchar 128, not null | legacy combined name; API keeps it in sync as `firstName + " " + lastName`; retained for backward compat / CSV export |
| `firstName` | varchar 128, not null, default `""` | |
| `lastName` | varchar 128, not null, default `""` | |
| `bsaNumber` | varchar 16, **unique**, nullable | BSA membership number, validated 4–9 digits in API |
| `rank` | varchar 64, nullable | |
| `age` | integer, nullable | 0–120 in API |
| `duesAmountOverrideCents` | integer, nullable | per-scout dues rate override; `null` = cycle default (see `02-data-model.md` open question — no API/UI writer yet) |
| `isActive` | bool, default true | deactivation preserves history |

## Endpoints (all require auth)

| Method & path | Behavior |
|---|---|
| `GET /api/scouts` | All scouts ordered by `name`, each with computed `balanceCents` (SUM of their transactions). |
| `POST /api/scouts` | Create. `firstName` required; `bsaNumber` 4–9 digits, unique (409 on conflict); `age` 0–120; `isActive` default true. 201. |
| `GET /api/scouts/:id` | Scout + `balanceCents` + `duesBreakdown {assessedCents, paidCents, remainingCents}` where assessed = SUM(dues.amountCents) for the scout, paid = SUM(transactions `dues_payment` where scoutId), remaining = max(0, assessed − paid). |
| `GET /api/scouts/:id/ledger` | `{balanceCents, entries[]}` — chronological transactions (desc) with joined names. |
| `PATCH /api/scouts/:id` | Partial update; re-derives `name` when first/last change; BSA uniqueness re-checked (409). |
| `DELETE /api/scouts/:id` | Hard delete, **blocked with 409** if the scout has any transactions or event participation ("Deactivate the scout instead of deleting"). |

## Invariants

- `name` is always kept in sync with `firstName`/`lastName` by the API.
- Deletion is refused while financial history exists — deactivate instead.
- A scout's balance is positive when the troop owes them, negative when they
  owe the troop (see `06-transactions-ledger.md`).

## Configuration

| Property | Default | Notes |
|---|---|---|
| `bsaNumber` pattern | `^\d{4,9}$` | zod in `routes/scouts.ts` |
| `age` range | `0–120` | zod |

## Testing

- Create/update keep `name` in sync with first + last (whitespace-collapsed).
- BSA number: 4–9 digits accepted; other lengths rejected (400); duplicate → 409
  on create and on update-by-another-scout.
- Detail endpoint returns `duesBreakdown` with remaining clamped at 0.
- Delete with history → 409 and no row removed; delete without history → 200.
- `isActive=false` scout still lists, still has ledger, but is excluded from
  dues generation (`09-dues.md`).

## Acceptance Criteria

- [ ] `GET /scouts` returns every scout with a computed `balanceCents`.
- [ ] BSA number is unique troop-wide and validated as 4–9 digits.
- [ ] `GET /scouts/:id` exposes balance and assessed/paid/remaining dues.
- [ ] `PATCH` re-derives the legacy `name` field.
- [ ] `DELETE` is blocked (409) while transactions or event participation exist.

## Open Questions

None.
