import { Router } from "express";
import { z } from "zod";
import {
  db,
  leadersTable,
  transactionsTable,
  eventParticipantsTable,
} from "@scout-expense-tracker/db";
import { eq, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getLeaderBalance } from "../lib/queries";

const router = Router();

const leaderSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(128),
  lastName: z.string().trim().max(128).optional().or(z.literal("").transform(() => undefined)),
  position: z.string().trim().max(64).optional().or(z.literal("").transform(() => undefined)),
  isActive: z.boolean().default(true),
});

const updateLeaderSchema = leaderSchema.partial();

function combinedName(firstName?: string, lastName?: string): string | undefined {
  if (firstName === undefined) return undefined;
  return `${firstName} ${lastName ?? ""}`.replace(/\s+/g, " ").trim();
}

// GET / — all leaders with computed balances.
router.get("/", requireAuth, async (_req, res) => {
  const leaders = await db.select().from(leadersTable).orderBy(leadersTable.name);
  const balances = await Promise.all(leaders.map((l) => getLeaderBalance(l.id)));
  res.json(leaders.map((l, i) => ({ ...l, balanceCents: balances[i] })));
});

// POST / — create leader.
router.post("/", requireAuth, async (req, res) => {
  const parsed = leaderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid leader", issues: parsed.error.flatten() });
    return;
  }

  const [leader] = await db
    .insert(leadersTable)
    .values({ ...parsed.data, name: combinedName(parsed.data.firstName, parsed.data.lastName) ?? "" })
    .returning();
  res.status(201).json(leader);
});

// GET /:id — leader detail + balance.
router.get("/:id", requireAuth, async (req, res) => {
  const [leader] = await db
    .select()
    .from(leadersTable)
    .where(eq(leadersTable.id, String(req.params.id)))
    .limit(1);
  if (!leader) {
    res.status(404).json({ error: "Leader not found" });
    return;
  }
  const balanceCents = await getLeaderBalance(leader.id);
  res.json({ ...leader, balanceCents });
});

// GET /:id/ledger — chronological ledger for the leader.
router.get("/:id/ledger", requireAuth, async (req, res) => {
  const [leader] = await db
    .select({ id: leadersTable.id })
    .from(leadersTable)
    .where(eq(leadersTable.id, String(req.params.id)))
    .limit(1);
  if (!leader) {
    res.status(404).json({ error: "Leader not found" });
    return;
  }
  const balanceCents = await getLeaderBalance(leader.id);
  const { listLedger } = await import("../lib/queries");
  const entries = await listLedger({ leaderId: leader.id });
  res.json({ balanceCents, entries });
});

// PATCH /:id — update leader.
router.patch("/:id", requireAuth, async (req, res) => {
  const parsed = updateLeaderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid leader", issues: parsed.error.flatten() });
    return;
  }

  const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.firstName !== undefined || parsed.data.lastName !== undefined) {
    updates.name = combinedName(parsed.data.firstName, parsed.data.lastName) ?? "";
  }
  const [leader] = await db
    .update(leadersTable)
    .set(updates)
    .where(eq(leadersTable.id, String(req.params.id)))
    .returning();
  if (!leader) {
    res.status(404).json({ error: "Leader not found" });
    return;
  }
  res.json(leader);
});

// DELETE /:id — hard delete. Blocked while financial history exists;
// leaders should deactivate the leader instead.
router.delete("/:id", requireAuth, async (req, res) => {
  const [leader] = await db
    .select({ id: leadersTable.id })
    .from(leadersTable)
    .where(eq(leadersTable.id, String(req.params.id)))
    .limit(1);
  if (!leader) {
    res.status(404).json({ error: "Leader not found" });
    return;
  }

  const [{ n: txCount }] = await db
    .select({ n: count() })
    .from(transactionsTable)
    .where(eq(transactionsTable.leaderId, leader.id));
  const [{ n: partCount }] = await db
    .select({ n: count() })
    .from(eventParticipantsTable)
    .where(eq(eventParticipantsTable.leaderId, leader.id));

  if (txCount > 0 || partCount > 0) {
    res.status(409).json({
      error:
        "This leader has financial history. Deactivate the leader instead of deleting.",
    });
    return;
  }

  await db.delete(leadersTable).where(eq(leadersTable.id, leader.id));
  res.json({ ok: true });
});

export default router;
