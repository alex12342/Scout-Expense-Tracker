---
description: Backup & restore — export all tables to a zip of JSON files, import restores in a single transaction.
status: active
---

# 13 — Backup & Restore

Full-database backup/restore. Export is a zip containing one JSON file per
table; import deletes and re-inserts all tables in a single transaction,
preserving original UUIDs so FK relationships and audit logs stay consistent.

Code: `artifacts/api-server/src/routes/backup.ts`,
frontend `SettingsPage` (export button + import file input).

## Export

`GET /api/backup/export` (auth required)

- Returns `application/zip` (`Content-Disposition: attachment;
  filename="trailhead-ledger-backup-<date>.zip"`).
- The zip contains one `.json` file per table, in FK order:
  `users`, `scouts`, `leaders`, `bank_accounts`, `events`,
  `event_participants`, `event_line_items`, `transactions`, `dues_cycles`,
  `dues`, `dues_transactions`.
- Each file is a JSON array of the table's rows (UUIDs, timestamps as ISO
  strings, money as integer cents).
- **`event_cost_changes` is intentionally excluded** — it is an append-only
  audit log and is preserved across restore (the import does not touch it).

## Import

`POST /api/backup/import` (auth required)

- `multipart/form-data`, field `file` (zip). Max 25 MB (multer memory
  storage).
- Validation: the zip must contain **all 11 required JSON files**; any
  missing file → 400 naming the missing files.
- Restore runs in **one DB transaction**:
  1. `DELETE` the 11 tables in **reverse-FK** order
     (`dues_transactions` → `dues` → `dues_cycles` → `transactions` →
     `event_line_items` → `event_participants` → `events` → `bank_accounts`
     → `leaders` → `scouts` → `users`).
  2. `INSERT` in **FK** order with original UUIDs (so `transactions.scout_id`,
     `event_participants.event_id`, `dues.cycle_id`, … all resolve; the
     untouched `event_cost_changes` audit rows keep pointing at valid event
     ids).
  3. Timestamp columns are revived from ISO strings back to `Date`
     (`createdAt`, `updatedAt`, `occurredAt`, `paidAt`, `lastLoginAt`)
     before insert — node-postgres serializes `Date` via `toISOString`;
     date-mode columns (`events.eventDate`, `dues.dueDate`) stay strings.
- On any failure the transaction rolls back — the DB is left as it was.

## Frontend

- `SettingsPage`: **Export backup** (downloads the zip via
  `api.getBackup()` → blob) and **Import backup** (file input →
  `api.importBackup(file)`, with confirm dialog warning the current data is
  replaced).

## Invariants

- Import is **destructive and all-or-nothing** (single transaction).
- Original UUIDs are preserved (no re-keying), keeping audit logs and any
  external references intact.
- `event_cost_changes` is never deleted or rewritten by import.
- Max upload 25 MB.

## Configuration

| Property | Default | Notes |
|---|---|---|
| upload limit | `25 MB` | multer memory storage |
| required zip files | 11 tables | see export list |
| excluded table | `event_cost_changes` | audit log preserved |

## Testing

- Export zip contains exactly the 11 documented files, each a valid JSON
  array.
- Import of an export of the same DB round-trips: row counts per table equal,
  UUIDs unchanged, `event_cost_changes` untouched.
- Import with a zip missing one file → 400 naming it, DB unchanged.
- Import failure mid-way (bad row) → full rollback (no partial state).
- Timestamps survive the round trip as valid timestamptz; date-mode columns
  survive as `YYYY-MM-DD` strings.
- > 25 MB upload → 413/400.

## Acceptance Criteria

- [ ] Export produces a self-contained, re-importable zip.
- [ ] Import restores all 11 tables atomically, preserving UUIDs.
- [ ] `event_cost_changes` survives import untouched.
- [ ] A bad import leaves the database exactly as it was.

## Open Questions

None.
