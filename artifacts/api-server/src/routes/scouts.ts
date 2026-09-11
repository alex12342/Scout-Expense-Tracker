import { Router } from "express";
import { z } from "zod";
import {
  db,
  scoutsTable,
  transactionsTable,
  eventParticipantsTable,
} from "@scout-expense-tracker/db";
import { eq, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getScoutBalance, listLedger } from "../lib/queries";

const router = Router();

const scoutSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(128),
  lastName: z.string().trim().max(128).optional().or(z.literal("").transform(() => undefined)),
  bsaNumber: z
    .string()
    .trim()
    .regex(/^\d{4,9}$/, "BSA number is 4-9 digits")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  rank: z.string().trim().max(64).optional().or(z.literal("").transform(() => undefined)),
  age: z.number().int().min(0).max(120).optional().or(z.literal(0).transform(() => undefined)),
  isActive: z.boolean().default(true),
});

const updateScoutSchema = scoutSchema.partial();

/** Derive the legacy combined `name` from first + last (kept in the DB for compat). */
function combinedName(firstName?: string, lastName?: string): string | undefined {
  if (firstName === undefined) return undefined;
  return `${firstName} ${lastName ?? ""}`.replace(/\s+/g, " ").trim();
}

// GET / — all scouts with computed balances.
router.get("/", requireAuth, async (_req, res) => {
  const scouts = await db.select().from(scoutsTable).orderBy(scoutsTable.name);
  const balances = await Promise.all(scouts.map((s) => getScoutBalance(s.id)));
  res.json(scouts.map((s, i) => ({ ...s, balanceCents: balances[i] })));
});

// POST / — create scout.
router.post("/", requireAuth, async (req, res) => {
  const parsed = scoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid scout", issues: parsed.error.flatten() });
    return;
  }

  if (parsed.data.bsaNumber) {
    const [dup] = await db
      .select({ id: scoutsTable.id })
      .from(scoutsTable)
      .where(eq(scoutsTable.bsaNumber, parsed.data.bsaNumber))
      .limit(1);
    if (dup) {
      res.status(409).json({ error: "A scout with that BSA number already exists" });
      return;
    }
  }

  const [scout] = await db
    .insert(scoutsTable)
    .values({ ...parsed.data, name: combinedName(parsed.data.firstName, parsed.data.lastName) ?? "" })
    .returning();
  res.status(201).json(scout);
});

// GET /:id — scout detail + balance.
router.get("/:id", requireAuth, async (req, res) => {
  const [scout] = await db
    .select()
    .from(scoutsTable)
    .where(eq(scoutsTable.id, String(req.params.id)))
    .limit(1);
  if (!scout) {
    res.status(404).json({ error: "Scout not found" });
    return;
  }
  const balanceCents = await getScoutBalance(scout.id);
  res.json({ ...scout, balanceCents });
});

// GET /:id/ledger — chronological ledger for the scout.
router.get("/:id/ledger", requireAuth, async (req, res) => {
  const [scout] = await db
    .select({ id: scoutsTable.id })
    .from(scoutsTable)
    .where(eq(scoutsTable.id, String(req.params.id)))
    .limit(1);
  if (!scout) {
    res.status(404).json({ error: "Scout not found" });
    return;
  }
  const balanceCents = await getScoutBalance(scout.id);
  const entries = await listLedger({ scoutId: scout.id });
  res.json({ balanceCents, entries });
});

// PATCH /:id — update scout.
router.patch("/:id", requireAuth, async (req, res) => {
  const parsed = updateScoutSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid scout", issues: parsed.error.flatten() });
    return;
  }

  if (parsed.data.bsaNumber) {
    const [dup] = await db
      .select({ id: scoutsTable.id })
      .from(scoutsTable)
      .where(eq(scoutsTable.bsaNumber, parsed.data.bsaNumber))
      .limit(1);
    if (dup && dup.id !== String(req.params.id)) {
      res.status(409).json({ error: "BSA number already used by another scout" });
      return;
    }
  }

  const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.firstName !== undefined || parsed.data.lastName !== undefined) {
    updates.name = combinedName(parsed.data.firstName, parsed.data.lastName) ?? "";
  }
  const [scout] = await db
    .update(scoutsTable)
    .set(updates)
    .where(eq(scoutsTable.id, String(req.params.id)))
    .returning();
  if (!scout) {
    res.status(404).json({ error: "Scout not found" });
    return;
  }
  res.json(scout);
});

// DELETE /:id — hard delete. Blocked while financial history exists;
// leaders should deactivate the scout instead.
router.delete("/:id", requireAuth, async (req, res) => {
  const [scout] = await db
    .select({ id: scoutsTable.id })
    .from(scoutsTable)
    .where(eq(scoutsTable.id, String(req.params.id)))
    .limit(1);
  if (!scout) {
    res.status(404).json({ error: "Scout not found" });
    return;
  }

  const [{ n: txCount }] = await db
    .select({ n: count() })
    .from(transactionsTable)
    .where(eq(transactionsTable.scoutId, scout.id));
  const [{ n: partCount }] = await db
    .select({ n: count() })
    .from(eventParticipantsTable)
    .where(eq(eventParticipantsTable.scoutId, scout.id));

  if (txCount > 0 || partCount > 0) {
    res.status(409).json({
      error:
        "This scout has financial history. Deactivate the scout instead of deleting.",
    });
    return;
  }

  await db.delete(scoutsTable).where(eq(scoutsTable.id, scout.id));
  res.json({ ok: true });
});

export default router;
