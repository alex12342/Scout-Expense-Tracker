import { Router } from "express";
import multer from "multer";
import JSZip from "jszip";
import { requireAuth } from "../middlewares/auth";
import {
  db,
  usersTable,
  scoutsTable,
  leadersTable,
  bankAccountsTable,
  eventsTable,
  eventParticipantsTable,
  eventLineItemsTable,
  transactionsTable,
  duesCyclesTable,
  duesTable,
  duesTransactionsTable,
} from "@scout-expense-tracker/db";

const router = Router();

// Backups are small; hold the upload in memory with a generous cap.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

/**
 * Tables in FK-dependency order (parents first). This single ordering drives
 * both the export (serialize each) and the import (insert in this order,
 * delete in reverse). `event_cost_changes` (audit log) is intentionally not
 * part of the backup — restored events keep their ids, so it stays valid.
 */
const TABLES = [
  { name: "users", table: usersTable },
  { name: "scouts", table: scoutsTable },
  { name: "leaders", table: leadersTable },
  { name: "bank_accounts", table: bankAccountsTable },
  { name: "events", table: eventsTable },
  { name: "event_participants", table: eventParticipantsTable },
  { name: "event_line_items", table: eventLineItemsTable },
  { name: "transactions", table: transactionsTable },
  { name: "dues_cycles", table: duesCyclesTable },
  { name: "dues", table: duesTable },
  { name: "dues_transactions", table: duesTransactionsTable },
] as const;

/**
 * Drizzle's pg driver serializes `timestamp` columns via `Date.toISOString()`.
 * After a JSON round-trip those values arrive as ISO strings, so convert them
 * back to `Date` before inserting. `date`-mode columns (eventDate, dueDate)
 * intentionally stay strings and are not in this set.
 */
const TIMESTAMP_COLUMNS = new Set([
  "createdAt",
  "updatedAt",
  "occurredAt",
  "paidAt",
  "lastLoginAt",
]);

function reviveDates(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    for (const key of TIMESTAMP_COLUMNS) {
      if (typeof row[key] === "string") row[key] = new Date(row[key] as string);
    }
    return row;
  });
}

/** GET /export — download the full backup as a zip of per-table JSON files. */
router.get("/export", requireAuth, async (_req, res) => {
  const zip = new JSZip();
  for (const { name, table } of TABLES) {
    const rows = await db.select().from(table as never);
    zip.file(`${name}.json`, JSON.stringify(rows));
  }

  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const filename = `scout-expense-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", String(buf.length));
  res.send(buf);
});

/** POST /import — restore a backup zip. Destructive: replaces all troop data. */
router.post(
  "/import",
  requireAuth,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No backup file provided" });
      return;
    }

    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(req.file.buffer);
    } catch {
      res.status(400).json({ error: "Invalid or corrupt zip file" });
      return;
    }

    // Read + validate every expected <name>.json entry up front.
    const data: Record<string, Record<string, unknown>[]> = {};
    for (const { name } of TABLES) {
      const entry = zip.file(`${name}.json`);
      if (!entry) {
        res.status(400).json({ error: `Backup is missing ${name}.json` });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(await entry.async("string"));
      } catch {
        res.status(400).json({ error: `${name}.json is not valid JSON` });
        return;
      }
      if (!Array.isArray(parsed)) {
        res.status(400).json({ error: `${name}.json must be a JSON array` });
        return;
      }
      data[name] = parsed as Record<string, unknown>[];
    }

    try {
      await db.transaction(async (tx) => {
        // Clear children first (reverse of TABLES order).
        for (let i = TABLES.length - 1; i >= 0; i--) {
          await tx.delete(TABLES[i].table as never);
        }
        // Insert parents first (TABLES order), preserving original UUIDs so
        // every FK relationship and the untouched audit log stay consistent.
        for (const { name, table } of TABLES) {
          if (data[name].length > 0) {
            await tx.insert(table as never).values(reviveDates(data[name]) as never);
          }
        }
      });
    } catch (err) {
      res.status(500).json({ error: `Restore failed: ${(err as Error).message}` });
      return;
    }

    res.json({ ok: true, restored: TABLES.map((t) => ({ table: t.name, rows: data[t.name].length })) });
  },
);

export default router;
