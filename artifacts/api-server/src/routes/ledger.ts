import { Router } from "express";
import { z } from "zod";
import {
  db,
  transactionsTable,
  scoutsTable,
  leadersTable,
  bankAccountsTable,
  TRANSACTION_TYPES,
} from "@scout-expense-tracker/db";
import { eq, and, gte, lte, desc, asc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { parseMoneyToCents } from "../lib/money";

const router = Router();

/**
 * Manual (non-event) transaction types creatable from the ledger endpoint.
 * event_allocation / event_payment are written only by the events routes so
 * event participants stay in sync.
 */
const MANUAL_TYPES = [
  "opening_balance",
  "scout_deposit",
  "reimbursement",
  "bank_expense",
  "bank_adjustment",
  "scout_adjustment",
] as const;

const createTransactionSchema = z
  .object({
    type: z.enum(MANUAL_TYPES),
    // Entered in dollars, positive or negative (e.g. "50", "-12.5").
    amount: z.union([z.string(), z.number()]),
    scoutId: z.string().uuid().optional(),
    leaderId: z.string().uuid().optional(),
    bankAccountId: z.string().uuid().optional(),
    description: z.string().trim().max(512).optional(),
    occurredAt: z.string().datetime({ offset: true }).optional(),
  })
  .transform((v) => {
    const cents = parseMoneyToCents(v.amount);
    if (cents === null || cents === 0) {
      throw new Error("Amount must be a non-zero dollar amount");
    }
    return { ...v, cents };
  });

function assertValidForType(
  type: (typeof MANUAL_TYPES)[number],
  scoutId: string | undefined,
  leaderId: string | undefined,
  bankAccountId: string | undefined,
): string | null {
  switch (type) {
    case "scout_deposit":
    case "reimbursement":
    case "scout_adjustment":
      if (!scoutId && !leaderId) return "A scout or leader is required for this transaction type";
      break;
    case "bank_expense":
    case "bank_adjustment":
      if (!bankAccountId) return "A bank account is required for this transaction type";
      break;
    case "opening_balance":
      if (!scoutId && !leaderId && !bankAccountId)
        return "Opening balance requires a scout, a leader, or a bank account";
      break;
  }
  return null;
}

// GET / — ledger entries with optional filters.
router.get("/", requireAuth, async (req, res) => {
  const scoutId = typeof req.query.scoutId === "string" ? req.query.scoutId : undefined;
  const bankAccountId =
    typeof req.query.bankAccountId === "string" ? req.query.bankAccountId : undefined;
  const rawType = typeof req.query.type === "string" ? req.query.type : undefined;
  const type =
    rawType && (TRANSACTION_TYPES as readonly string[]).includes(rawType)
      ? (rawType as (typeof TRANSACTION_TYPES)[number])
      : undefined;
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const offset = Number(req.query.offset) || 0;

  const conditions = [];
  if (scoutId) conditions.push(eq(transactionsTable.scoutId, scoutId));
  if (bankAccountId)
    conditions.push(eq(transactionsTable.bankAccountId, bankAccountId));
  if (type) conditions.push(eq(transactionsTable.type, type));
  if (from) conditions.push(gte(transactionsTable.occurredAt, new Date(from)));
  if (to) conditions.push(lte(transactionsTable.occurredAt, new Date(to)));

  const entries = await db
    .select({
      tx: transactionsTable,
      scoutName: scoutsTable.name,
      leaderName: leadersTable.name,
      bankAccountName: bankAccountsTable.name,
    })
    .from(transactionsTable)
    .leftJoin(scoutsTable, eq(transactionsTable.scoutId, scoutsTable.id))
    .leftJoin(
      leadersTable,
      eq(transactionsTable.leaderId, leadersTable.id),
    )
    .leftJoin(
      bankAccountsTable,
      eq(transactionsTable.bankAccountId, bankAccountsTable.id),
    )
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(transactionsTable.occurredAt), desc(transactionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json(
    entries.map((r) => ({
      ...r.tx,
      scoutName: r.scoutName,
      leaderName: r.leaderName,
      bankAccountName: r.bankAccountName,
    })),
  );
});

// POST / — record a manual ledger transaction.
router.post("/", requireAuth, async (req, res) => {
  const parsed = createTransactionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid transaction" });
    return;
  }
  const { type, cents, scoutId, leaderId, bankAccountId, description, occurredAt } =
    parsed.data;

  const typeError = assertValidForType(type, scoutId, leaderId, bankAccountId);
  if (typeError) {
    res.status(400).json({ error: typeError });
    return;
  }

  // Verify referenced entities exist.
  if (scoutId) {
    const [scout] = await db
      .select({ id: scoutsTable.id })
      .from(scoutsTable)
      .where(eq(scoutsTable.id, scoutId))
      .limit(1);
    if (!scout) {
      res.status(400).json({ error: "Unknown scout" });
      return;
    }
  }
  if (leaderId) {
    const [leader] = await db
      .select({ id: leadersTable.id })
      .from(leadersTable)
      .where(eq(leadersTable.id, leaderId))
      .limit(1);
    if (!leader) {
      res.status(400).json({ error: "Unknown leader" });
      return;
    }
  }
  if (bankAccountId) {
    const [acct] = await db
      .select({ id: bankAccountsTable.id })
      .from(bankAccountsTable)
      .where(eq(bankAccountsTable.id, bankAccountId))
      .limit(1);
    if (!acct) {
      res.status(400).json({ error: "Unknown bank account" });
      return;
    }
  }

  // Sign conventions (troop perspective):
  //  scout_deposit / bank income  -> +
  //  reimbursement / bank_expense -> -
  //  adjustments / opening        -> user-provided sign
  let amountCents = cents;
  if (type === "scout_deposit") amountCents = Math.abs(cents);
  if (type === "reimbursement") amountCents = -Math.abs(cents);
  if (type === "bank_expense") amountCents = -Math.abs(cents);

  const [tx] = await db
    .insert(transactionsTable)
    .values({
      occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
      type,
      amountCents,
      scoutId: scoutId ?? null,
      leaderId: leaderId ?? null,
      bankAccountId: bankAccountId ?? null,
      description: description ?? null,
      createdBy: req.userId,
    })
    .returning();

  res.status(201).json(tx);
});

// PATCH /:id — edit a manual transaction (never event rows).
router.patch("/:id", requireAuth, async (req, res) => {
  const [tx] = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.id, String(req.params.id)))
    .limit(1);
  if (!tx) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  if (
    tx.type === "event_allocation" ||
    tx.type === "event_payment" ||
    tx.type === "event_refund" ||
    tx.type === "event_true_up"
  ) {
    res.status(409).json({
      error: "Event transactions can't be edited directly.",
    });
    return;
  }

  const body = req.body as { amount?: string | number; description?: string; occurredAt?: string; type?: string; scoutId?: string; leaderId?: string; bankAccountId?: string } | undefined;
  if (!body) {
    res.status(400).json({ error: "No update data provided" });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (body.amount !== undefined) {
    const cents = parseMoneyToCents(body.amount);
    if (cents === null || cents === 0) {
      res.status(400).json({ error: "Invalid amount" });
      return;
    }
    updates.amountCents = cents;
  }
  if (body.description !== undefined) {
    updates.description = (body.description as string) || null;
  }
  if (body.occurredAt !== undefined) {
    updates.occurredAt = new Date(body.occurredAt as string);
  }
  if (body.type !== undefined) {
    const newType = body.type as string;
    if (!(MANUAL_TYPES as readonly string[]).includes(newType)) {
      res.status(400).json({ error: "Invalid transaction type" });
      return;
    }
    updates.type = newType;
  }
  if (body.scoutId !== undefined) {
    updates.scoutId = body.scoutId === "" ? null : (body.scoutId as string);
  }
  if (body.leaderId !== undefined) {
    updates.leaderId = body.leaderId === "" ? null : (body.leaderId as string);
  }
  if (body.bankAccountId !== undefined) {
    updates.bankAccountId = body.bankAccountId === "" ? null : (body.bankAccountId as string);
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const [updated] = await db
    .update(transactionsTable)
    .set(updates)
    .where(eq(transactionsTable.id, tx.id))
    .returning();

  res.json(updated);
});

// DELETE /:id — remove a manual transaction (never event rows).
router.delete("/:id", requireAuth, async (req, res) => {
  const [tx] = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.id, String(req.params.id)))
    .limit(1);
  if (!tx) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  if (
    tx.type === "event_allocation" ||
    tx.type === "event_payment" ||
    tx.type === "event_refund" ||
    tx.type === "event_true_up"
  ) {
    res.status(409).json({
      error:
        "Event transactions can't be deleted directly. Refund or void the event instead.",
    });
    return;
  }
  await db.delete(transactionsTable).where(eq(transactionsTable.id, tx.id));
  res.json({ ok: true });
});

export default router;
