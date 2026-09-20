---
description: CSV import of scout and leader rosters with per-row validation and upsert-by-name.
status: active
---

# 12 — CSV Import (Roster)

Bulk-load scouts and leaders from CSV. The import **upserts by full name**:
an existing member is updated, a new one is created. BSA numbers are
validated and must not collide with another member.

Code: `artifacts/api-server/src/routes/import.ts`,
`artifacts/api-server/src/lib/csv.ts` (parse helper).

## Endpoints (auth required)

| Method & path | Behavior |
|---|---|
| `POST /api/import/scouts` | multipart or raw CSV body. Header row required. Returns `{imported: number, errors: {row, field?, message}[]}` (row numbers are 1-based data rows). |
| `POST /api/import/leaders` | Same contract for leaders. |

## Column mapping

| Field | Accepted headers (case-insensitive) |
|---|---|
| `firstName` | `firstName`, `First Name`, `first_name`, `first` |
| `lastName` | `lastName`, `Last Name`, `last_name`, `last` |
| `bsaNumber` | `bsaNumber`, `BSA Number`, `bsa_number`, `bsa` |
| `rank` | `rank` |
| `age` | `age` |
| `position` (leaders) | `position`, `Position` |

- `firstName` is **required** on every data row (missing → row error).
- `bsaNumber`, when present, must be 4–9 digits; a collision with a
  *different* existing scout is a row error (does not stop the import).
- Rows that fail are reported in `errors[]`; valid rows in the same file are
  still imported (no all-or-nothing).
- Existing member match = exact `firstName + " " + lastName` (trimmed).

## Invariants

- Import never deletes members.
- Legacy `name` column is kept in sync (`firstName + " " + lastName`).
- BSA uniqueness is preserved (collisions are row errors, not overwrites).

## Configuration

| Property | Default | Notes |
|---|---|---|
| `bsaNumber` pattern | `^\d{4,9}$` | same as `03-scouts.md` |
| match key | trimmed `firstName + " " + lastName` | upsert key |

## Testing

- Header-only file → 0 imported, no errors.
- Mixed file (valid + missing-firstName + bad-BSA) → valid rows imported,
  others reported with row numbers.
- Re-import of an existing member updates fields (no duplicate row).
- BSA collision with a different scout → row error, both rows intact.
- Leaders import honors `position`; ignores `rank`/`age`.
- Non-CSV body → 400.

## Acceptance Criteria

- [ ] Both endpoints accept CSV with the documented header aliases.
- [ ] Valid rows import even when other rows fail; failures are reported
      per-row.
- [ ] Upsert-by-name never duplicates or deletes members.
- [ ] BSA uniqueness is enforced as a row error, not a silent overwrite.

## Open Questions

- The web app has `api.importScouts`/`api.importLeaders` clients but **no UI
  wired to them** as of this writing. Resolved as API-only for now; a spec
  amendment is required before adding the settings-screen import form.
