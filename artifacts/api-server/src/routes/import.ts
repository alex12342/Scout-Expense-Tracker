import { Router } from "express";
import { z } from "zod";
import {
  db,
  scoutsTable,
  leadersTable,
} from "@scout-expense-tracker/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

/**
 * Parse a CSV body (RFC 4180-ish: comma-delimited, quoted fields, \r\n or \n).
 * Returns an array of row objects keyed by the header row.
 */
function parseCSV(text: string): Record<string, string>[] {
  // Split on \r\n or \n.
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    // Simple CSV parser: split by comma (handles basic quoted fields).
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  values.push(current);
  return values;
}

interface UpsertScoutData {
  firstName: string;
  lastName: string;
  bsaNumber?: string;
  rank?: string;
  age?: number;
  isActive?: boolean;
}

interface UpsertLeaderData {
  firstName: string;
  lastName: string;
  position?: string;
  isActive?: boolean;
}

/**
 * Upsert a scout by matching on first + last name.
 * Returns the upserted scout.
 */
async function upsertScout(data: UpsertScoutData) {
  const { firstName, lastName, ...rest } = data;
  const name = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();

  // Check for existing scout by first + last name.
  const [existing] = await db
    .select({ id: scoutsTable.id })
    .from(scoutsTable)
    .where(eq(scoutsTable.name, name))
    .limit(1);

  if (existing) {
    const [scout] = await db
      .update(scoutsTable)
      .set({
        firstName,
        lastName,
        name,
        bsaNumber: rest.bsaNumber || null,
        rank: rest.rank || null,
        age: rest.age ?? null,
        isActive: rest.isActive ?? true,
        updatedAt: new Date(),
      })
      .where(eq(scoutsTable.id, existing.id))
      .returning();
    return scout;
  }

  // Check for BSA number conflict.
  if (rest.bsaNumber) {
    const [dup] = await db
      .select({ id: scoutsTable.id })
      .from(scoutsTable)
      .where(eq(scoutsTable.bsaNumber, rest.bsaNumber))
      .limit(1);
    if (dup) {
      throw new Error(`A scout with BSA number ${rest.bsaNumber} already exists`);
    }
  }

  const [scout] = await db
    .insert(scoutsTable)
    .values({
      firstName,
      lastName,
      name,
      bsaNumber: rest.bsaNumber || null,
      rank: rest.rank || null,
      age: rest.age ?? null,
      isActive: rest.isActive ?? true,
    })
    .returning();
  return scout;
}

/**
 * Upsert a leader by matching on first + last name.
 */
async function upsertLeader(data: UpsertLeaderData) {
  const { firstName, lastName, ...rest } = data;
  const name = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();

  const [existing] = await db
    .select({ id: leadersTable.id })
    .from(leadersTable)
    .where(eq(leadersTable.name, name))
    .limit(1);

  if (existing) {
    const [leader] = await db
      .update(leadersTable)
      .set({
        firstName,
        lastName,
        name,
        position: rest.position || null,
        isActive: rest.isActive ?? true,
        updatedAt: new Date(),
      })
      .where(eq(leadersTable.id, existing.id))
      .returning();
    return leader;
  }

  const [leader] = await db
    .insert(leadersTable)
    .values({
      firstName,
      lastName,
      name,
      position: rest.position || null,
      isActive: rest.isActive ?? true,
    })
    .returning();
  return leader;
}

// POST /import/scouts — CSV import for scouts.
// Expected columns (case-insensitive): firstName, lastName, bsaNumber, rank, age, isActive
router.post("/scouts", requireAuth, async (req, res) => {
  const body = z.object({
    csv: z.string(),
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const rows = parseCSV(body.data.csv);
  const results: Array<{ row: number; firstName: string; lastName: string; ok: boolean; error?: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const firstName = row["firstName"] ?? row["First Name"] ?? row["first_name"] ?? "";
    const lastName = row["lastName"] ?? row["Last Name"] ?? row["last_name"] ?? "";
    if (!firstName.trim()) {
      results.push({ row: i + 2, firstName: "", lastName: "", ok: false, error: "Missing first name" });
      continue;
    }
    try {
      const ageStr = row["age"] ?? row["Age"] ?? "";
      const age = ageStr ? (isNaN(parseInt(ageStr, 10)) ? undefined : parseInt(ageStr, 10)) : undefined;
      const bsaNumber = row["bsaNumber"] ?? row["BSA Number"] ?? row["bsa_number"] ?? undefined;
      const rank = row["rank"] ?? row["Rank"] ?? undefined;
      const isActiveStr = row["isActive"] ?? row["Is Active"] ?? row["is_active"] ?? "";
      const isActive = isActiveStr ? isActiveStr.toLowerCase() !== "false" : true;

      const scout = await upsertScout({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        bsaNumber: bsaNumber,
        rank: rank,
        age: age,
        isActive,
      });
      results.push({ row: i + 2, firstName: scout.firstName, lastName: scout.lastName, ok: true });
    } catch (err) {
      results.push({ row: i + 2, firstName, lastName, ok: false, error: (err as Error).message });
    }
  }

  res.json({ results });
});

// POST /import/leaders — CSV import for leaders.
// Expected columns (case-insensitive): firstName, lastName, position, isActive
router.post("/leaders", requireAuth, async (req, res) => {
  const body = z.object({
    csv: z.string(),
  }).safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const rows = parseCSV(body.data.csv);
  const results: Array<{ row: number; firstName: string; lastName: string; ok: boolean; error?: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const firstName = row["firstName"] ?? row["First Name"] ?? row["first_name"] ?? "";
    const lastName = row["lastName"] ?? row["Last Name"] ?? row["last_name"] ?? "";
    if (!firstName.trim()) {
      results.push({ row: i + 2, firstName: "", lastName: "", ok: false, error: "Missing first name" });
      continue;
    }
    try {
      const position = row["position"] ?? row["Position"] ?? undefined;
      const isActiveStr = row["isActive"] ?? row["Is Active"] ?? row["is_active"] ?? "";
      const isActive = isActiveStr ? isActiveStr.toLowerCase() !== "false" : true;

      const leader = await upsertLeader({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        position: position,
        isActive,
      });
      results.push({ row: i + 2, firstName: leader.firstName, lastName: leader.lastName, ok: true });
    } catch (err) {
      results.push({ row: i + 2, firstName, lastName, ok: false, error: (err as Error).message });
    }
  }

  res.json({ results });
});

export default router;
