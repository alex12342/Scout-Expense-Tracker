import { Router } from "express";
import { z } from "zod";
import {
  db,
  scoutsTable,
  leadersTable,
  transactionsTable,
  eventParticipantsTable,
  eventLineItemsTable,
  eventCostChangesTable,
  duesCyclesTable,
  duesTable,
  duesTransactionsTable,
  bankAccountsTable,
  usersTable,
} from "@scout-expense-tracker/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const convertSchema = z.object({
  position: z.enum(["assistant_leader", "tight_leader", "den_chief", "committee_chair", "treasurer", "secretary", "other"]).optional(),
});

router.post("/:id/convert-to-leader", requireAuth, async (req, res) => {
  const parsed = convertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", issues: parsed.error.flatten() });
    return;
  }

  const scoutId = String(req.params.id);
  const position = parsed.data.position;

  // Validate scout exists and is active
  const [scout] = await db
    .select()
    .from(scoutsTable)
    .where(eq(scoutsTable.id, scoutId))
    .limit(1);

  if (!scout) {
    res.status(404).json({ error: "Scout not found" });
    return;
  }

  if (!scout.isActive) {
    res.status(400).json({ error: "Cannot convert an inactive scout" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    // Create new leader row
    const [leader] = await tx
      .insert(leadersTable)
      .values({
        firstName: scout.firstName,
        lastName: scout.lastName,
        name: `${scout.firstName} ${scout.lastName}`,
        position: position ?? null,
        isActive: true,
      })
      .returning();

    // Transfer all transactions
    await tx
      .update(transactionsTable)
      .set({ scoutId: null, leaderId: leader.id })
      .where(and(
        eq(transactionsTable.scoutId, scoutId),
        sql`${transactionsTable.leaderId} IS NULL`,
      ));

    // Transfer event participants
    await tx
      .update(eventParticipantsTable)
      .set({ scoutId: null, leaderId: leader.id })
      .where(eq(eventParticipantsTable.scoutId, scoutId));

    // Deactivate scout (preserve history)
    await tx
      .update(scoutsTable)
      .set({ isActive: false })
      .where(eq(scoutsTable.id, scoutId));

    return leader;
  });

  res.json(result);
});

export default router;
