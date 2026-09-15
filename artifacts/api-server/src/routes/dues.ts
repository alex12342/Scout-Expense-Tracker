import { Router, Request } from "express";
import { z } from "zod";
import { eq, and, inArray, sql, count, lt, desc, not } from "drizzle-orm";
import {
  db,
  duesCyclesTable,
  duesTable,
  scoutsTable,
  leadersTable,
  duesTransactionsTable,
  transactionsTable,
} from "@scout-expense-tracker/db";
import { requireAuth } from "../middlewares/auth";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────

async function logDuesTransaction(
  duesId: string,
  action: string,
  userId: string | undefined,
  amountCents: number,
  isPaid: boolean,
  isWaived: boolean,
  note: string | undefined,
  transactionId: string | undefined,
): Promise<void> {
  await db
    .insert(duesTransactionsTable)
    .values({
      duesId,
      action,
      userId: userId ?? null,
      amountCents,
      isPaid,
      isWaived,
      note: note ?? null,
      transactionId: transactionId ?? null,
    });
}

// Audit-trail actions that represent actual payments against a dues entry.
const DUES_PAYMENT_ACTIONS = ["payment", "payment_recorded", "partial_payment"];

// Total already paid toward a dues entry (from the payment audit trail).
async function paidToDateCents(duesId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${duesTransactionsTable.amountCents}), 0)` })
    .from(duesTransactionsTable)
    .where(
      and(
        eq(duesTransactionsTable.duesId, duesId),
        inArray(duesTransactionsTable.action, DUES_PAYMENT_ACTIONS),
      ),
    );
  return Number(row?.total ?? 0);
}

type DuesPaymentStateRow = {
  id: string;
  amountCents: number;
  isPaid: boolean;
  isWaived: boolean;
  dueDate: string | null;
};

type DuesPaymentState = {
  isPaid: boolean;
  amountPaidCents: number;
  remainingCents: number;
  status: "unpaid" | "partial" | "paid" | "overdue" | "waived";
};

// Attach paid-to-date, remaining, effective isPaid, and status to dues rows.
// An entry whose partial payments sum to the full amount counts as paid
// even if the isPaid flag was never flipped.
async function withDuesPaymentState<T extends DuesPaymentStateRow>(
  entries: T[],
): Promise<Array<T & DuesPaymentState>> {
  const entryIds = entries.map((e) => e.id);
  const paidSums = entryIds.length
    ? await db
        .select({
          duesId: duesTransactionsTable.duesId,
          total: sql<number>`coalesce(sum(${duesTransactionsTable.amountCents}), 0)`,
        })
        .from(duesTransactionsTable)
        .where(
          and(
            inArray(duesTransactionsTable.duesId, entryIds),
            inArray(duesTransactionsTable.action, DUES_PAYMENT_ACTIONS),
          ),
        )
        .groupBy(duesTransactionsTable.duesId)
    : [];
  const paidMap = new Map(paidSums.map((r) => [r.duesId, Number(r.total)]));
  const today = new Date();
  return entries.map((e) => {
    const amountPaidCents = Math.min(e.amountCents, paidMap.get(e.id) ?? 0);
    const remainingCents = Math.max(0, e.amountCents - amountPaidCents);
    const isPaid = e.isPaid || (e.amountCents > 0 && amountPaidCents >= e.amountCents);
    let status: DuesPaymentState["status"];
    if (e.isWaived) status = "waived";
    else if (isPaid) status = "paid";
    else if (amountPaidCents > 0 && remainingCents > 0) status = "partial";
    else if (e.dueDate && new Date(e.dueDate) < today) status = "overdue";
    else status = "unpaid";
    return { ...e, isPaid, amountPaidCents, remainingCents, status };
  });
}

// Create a ledger transaction when a dues entry is marked paid.
async function createDuesLedgerTransaction(
  cycle: { label: string; bankAccountId: string | null },
  memberType: "scout" | "leader",
  memberId: string | null,
  amountCents: number,
  userId: string | undefined,
): Promise<string | null> {
  const description = memberType === "leader"
    ? `${memberId} — ${cycle.label} Dues`
    : `${cycle.label} Dues`;

  const [tx] = await db
    .insert(transactionsTable)
    .values({
      type: "dues_payment",
      scoutId: memberType === "scout" ? memberId : null,
      leaderId: memberType === "leader" ? memberId : null,
      bankAccountId: cycle.bankAccountId,
      amountCents,
      description,
      createdBy: userId ?? null,
    })
    .returning();
  return tx?.id ?? null;
}

// ── Cycles ───────────────────────────────────────────────────────────────

router.get("/cycles", requireAuth, async (_req, res) => {
  const cycles = await db
    .select({
      id: duesCyclesTable.id,
      label: duesCyclesTable.label,
      scoutAmountCents: duesCyclesTable.scoutAmountCents,
      leaderAmountCents: duesCyclesTable.leaderAmountCents,
      isCurrent: duesCyclesTable.isCurrent,
      bankAccountId: duesCyclesTable.bankAccountId,
      createdAt: duesCyclesTable.createdAt,
    })
    .from(duesCyclesTable)
    .orderBy(duesCyclesTable.createdAt);
  res.json(cycles);
});

router.post("/cycles", requireAuth, async (req, res) => {
  const body = z
    .object({
      label: z.string().trim().min(1).max(64),
      scoutAmountCents: z.number().int().min(0),
      leaderAmountCents: z.number().int().min(0),
      bankAccountId: z.string().uuid().nullable().optional(),
      isCurrent: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid cycle data" });
    return;
  }

  const isCurrent = body.data.isCurrent ?? true;

  let cycle: typeof duesCyclesTable.$inferSelect;
  if (isCurrent) {
    // Unmark all cycles first
    await db
      .update(duesCyclesTable)
      .set({ isCurrent: false });
    [cycle] = await db
      .insert(duesCyclesTable)
      .values({
        label: body.data.label,
        scoutAmountCents: body.data.scoutAmountCents,
        leaderAmountCents: body.data.leaderAmountCents,
        bankAccountId: body.data.bankAccountId ?? null,
        isCurrent: true,
      })
      .returning();
  } else {
    [cycle] = await db
      .insert(duesCyclesTable)
      .values({
        label: body.data.label,
        scoutAmountCents: body.data.scoutAmountCents,
        leaderAmountCents: body.data.leaderAmountCents,
        bankAccountId: body.data.bankAccountId ?? null,
        isCurrent: false,
      })
      .returning();
  }
  res.status(201).json(cycle);
});

router.patch("/cycles/:id", requireAuth, async (req, res) => {
  const body = z
    .object({
      label: z.string().trim().min(1).max(64).optional(),
      scoutAmountCents: z.number().int().min(0).optional(),
      leaderAmountCents: z.number().int().min(0).optional(),
      isCurrent: z.boolean().optional(),
      bankAccountId: z.string().uuid().nullable().optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid patch data" });
    return;
  }

  if (body.data.isCurrent === true) {
    // Unmark all cycles first, then set this one
    await db
      .update(duesCyclesTable)
      .set({ isCurrent: false });
    await db
      .update(duesCyclesTable)
      .set({ isCurrent: true })
      .where(sql`${duesCyclesTable.id} = ${String(req.params.id)}`);
  } else if (body.data.isCurrent === false) {
    // Find another cycle to become current
    const [next] = await db
      .select()
      .from(duesCyclesTable)
      .where(sql`${duesCyclesTable.isCurrent} = false`)
      .orderBy(desc(duesCyclesTable.createdAt))
      .limit(1);
    if (next) {
      await db
        .update(duesCyclesTable)
        .set({ isCurrent: true })
        .where(eq(duesCyclesTable.id, next.id));
    }
  }

  const [cycle] = await db
    .update(duesCyclesTable)
    .set({
      label: body.data.label,
      scoutAmountCents: body.data.scoutAmountCents,
      leaderAmountCents: body.data.leaderAmountCents,
      isCurrent: body.data.isCurrent,
      bankAccountId: body.data.bankAccountId ?? null,
    })
    .where(eq(duesCyclesTable.id, String(req.params.id)))
    .returning();
  if (!cycle) {
    res.status(404).json({ error: "Cycle not found" });
    return;
  }
  res.json(cycle);
});

router.delete("/cycles/:id", requireAuth, async (req, res) => {
  const [cycle] = await db
    .select()
    .from(duesCyclesTable)
    .where(eq(duesCyclesTable.id, String(req.params.id)))
    .limit(1);
  if (!cycle) {
    res.status(404).json({ error: "Cycle not found" });
    return;
  }

  if (cycle.isCurrent) {
    // Set another cycle as current before deleting
    const [next] = await db
      .select()
      .from(duesCyclesTable)
      .where(sql`${duesCyclesTable.isCurrent} = false`)
      .orderBy(desc(duesCyclesTable.createdAt))
      .limit(1);
    if (next) {
      await db
        .update(duesCyclesTable)
        .set({ isCurrent: true })
        .where(eq(duesCyclesTable.id, next.id));
    }
  }

  await db.delete(duesCyclesTable).where(eq(duesCyclesTable.id, cycle.id));
  res.json({ ok: true });
});

// ── Dues entries ─────────────────────────────────────────────────────────

router.get("/cycles/:cycleId/dues", requireAuth, async (req, res) => {
  const cycleId = String(req.params.cycleId);

  const entries = await db
    .select({
      id: duesTable.id,
      cycleId: duesTable.cycleId,
      memberType: duesTable.memberType,
      memberId: duesTable.memberId,
      amountCents: duesTable.amountCents,
      isPaid: duesTable.isPaid,
      isWaived: duesTable.isWaived,
      paidAt: duesTable.paidAt,
      dueDate: duesTable.dueDate,
      notes: duesTable.notes,
      createdAt: duesTable.createdAt,
      updatedAt: duesTable.updatedAt,
      memberName: sql<string>`
        case
          when ${duesTable.memberType} = 'scout' then (select ${scoutsTable.firstName} || ' ' || ${scoutsTable.lastName} from ${scoutsTable} where ${scoutsTable.id} = ${duesTable.memberId})
          when ${duesTable.memberType} = 'leader' then (select ${leadersTable.firstName} || ' ' || ${leadersTable.lastName} from ${leadersTable} where ${leadersTable.id} = ${duesTable.memberId})
          else 'Troop'
        end`,
    })
    .from(duesTable)
    .where(eq(duesTable.cycleId, cycleId));

  res.json(await withDuesPaymentState(entries));
});

router.post("/cycles/:cycleId/dues", requireAuth, async (req, res) => {
  const body = z
    .object({
      cycleId: z.string().uuid(),
      memberType: z.enum(["scout", "leader"]),
      memberId: z.string().uuid().nullable(),
      amountCents: z.number().int().min(0).optional(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid dues data" });
    return;
  }

  const [entry] = await db
    .insert(duesTable)
    .values({
      cycleId: body.data.cycleId,
      memberType: body.data.memberType,
      memberId: body.data.memberId,
      amountCents: body.data.amountCents ?? 0,
    })
    .returning();
  res.status(201).json(entry);
});

// ── Bulk actions (MUST come before /dues/:id) ────────────────────────────

router.post("/bulk-toggle", requireAuth, async (req, res) => {
  const body = z
    .object({ ids: z.array(z.string().uuid()) })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid ids" });
    return;
  }

  const ids = body.data.ids.map((id) => id);
  const updated = await db
    .update(duesTable)
    .set({
      isPaid: sql`NOT ${duesTable.isPaid}`,
      paidAt: sql`case when ${duesTable.isPaid} = false then now() else null end`,
      updatedAt: new Date(),
    })
    .where(sql`${duesTable.id} in (${sql.join(ids.map((id) => sql`${id}`))})`)
    .returning();

  for (const d of updated) {
    await logDuesTransaction(
      d.id,
      d.isPaid ? "bulk_unpaid" : "bulk_paid",
      (req as Request & { user?: { id: string } }).user?.id,
      d.amountCents,
      d.isPaid,
      d.isWaived,
      undefined,
      undefined,
    );
  }

  res.json(updated);
});

router.post("/bulk-mark-paid", requireAuth, async (req, res) => {
  const body = z
    .object({ ids: z.array(z.string().uuid()) })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid ids" });
    return;
  }

  const ids = body.data.ids.map((id) => id);
  const updated = await db
    .update(duesTable)
    .set({
      isPaid: true,
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(sql`${duesTable.id} in (${sql.join(ids.map((id) => sql`${id}`))})`)
    .returning();

  const userId = (req as Request & { user?: { id: string } }).user?.id;

  for (const d of updated) {
    await logDuesTransaction(
      d.id,
      "bulk_marked_paid",
      userId,
      d.amountCents,
      d.isPaid,
      d.isWaived,
      undefined,
      undefined,
    );
  }

  res.json(updated);
});

// ── Individual dues actions ──────────────────────────────────────────────

// Record a payment for a specific dues entry.
router.post("/:id/record-payment", requireAuth, async (req, res) => {
  const duesId = String(req.params.id);
  const body = z
    .object({
      amountCents: z.number().int().min(0),
      bankAccountId: z.string().uuid(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid payment data" });
    return;
  }

  const [dues] = await db
    .select({
      id: duesTable.id,
      isPaid: duesTable.isPaid,
      paidAt: duesTable.paidAt,
      memberType: duesTable.memberType,
      memberId: duesTable.memberId,
      amountCents: duesTable.amountCents,
      cycleId: duesTable.cycleId,
    })
    .from(duesTable)
    .where(eq(duesTable.id, duesId))
    .limit(1);
  if (!dues) {
    res.status(404).json({ error: "Dues entry not found" });
    return;
  }
  const paidToDate = await paidToDateCents(dues.id);
  const remainingCents = Math.max(0, dues.amountCents - paidToDate);
  if (dues.isPaid || remainingCents <= 0) {
    res.status(400).json({ error: "Dues already fully paid" });
    return;
  }

  const paymentCents = Math.min(body.data.amountCents, remainingCents);
  const isFullyPaid = paidToDate + paymentCents >= dues.amountCents;

  // Create dues_payment transaction (positive = reduces debt).
  const [tx] = await db
    .insert(transactionsTable)
    .values({
      type: "dues_payment",
      scoutId: dues.memberType === "scout" ? dues.memberId : null,
      leaderId: dues.memberType === "leader" ? dues.memberId : null,
      bankAccountId: body.data.bankAccountId,
      amountCents: paymentCents,
      description: `${dues.memberType} dues payment`,
    })
    .returning();

  // Only mark as paid if fully covered.
  const [updated] = await db
    .update(duesTable)
    .set({
      isPaid: isFullyPaid,
      paidAt: isFullyPaid ? new Date() : dues.paidAt,
      updatedAt: new Date(),
    })
    .where(eq(duesTable.id, duesId))
    .returning();

  await logDuesTransaction(
    dues.id,
    isFullyPaid ? "payment_recorded" : "partial_payment",
    (req as Request & { user?: { id: string } }).user?.id,
    paymentCents,
    isFullyPaid,
    false,
    undefined,
    tx?.id ?? undefined,
  );

  res.json(updated);
});

// Apply a deposit to all outstanding dues for a member (oldest first).
router.post("/apply-deposit", requireAuth, async (req, res) => {
  const body = z
    .object({
      memberType: z.enum(["scout", "leader"]),
      memberId: z.string().uuid(),
      amountCents: z.number().int().min(0),
      bankAccountId: z.string().uuid(),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid deposit data" });
    return;
  }

  const remaining = body.data.amountCents;
  const applied: { duesId: string; amountCents: number; fullyPaid: boolean }[] = [];
  let balance = remaining;

  // Get all unpaid dues for this member, oldest first.
  const unpaid = await db
    .select({
      id: duesTable.id,
      amountCents: duesTable.amountCents,
      isPaid: duesTable.isPaid,
      isWaived: duesTable.isWaived,
      paidAt: duesTable.paidAt,
      memberType: duesTable.memberType,
      memberId: duesTable.memberId,
      cycleId: duesTable.cycleId,
    })
    .from(duesTable)
    .where(
      and(
        eq(duesTable.memberType, body.data.memberType),
        eq(duesTable.memberId, body.data.memberId),
        eq(duesTable.isPaid, false),
        eq(duesTable.isWaived, false),
      ),
    )
    .orderBy(duesTable.createdAt);

  for (const entry of unpaid) {
    if (balance <= 0) break;
    const paidToDate = await paidToDateCents(entry.id);
    const remaining = Math.max(0, entry.amountCents - paidToDate);
    if (remaining <= 0) continue;
    const applyAmount = Math.min(remaining, balance);
    applied.push({
      duesId: entry.id,
      amountCents: applyAmount,
      fullyPaid: paidToDate + applyAmount >= entry.amountCents,
    });
    balance -= applyAmount;
  }

  // Ledger transaction + dues update + audit trail per applied entry.
  for (const a of applied) {
    const entry = unpaid.find((e) => e.id === a.duesId);
    if (!entry) continue;
    const [tx] = await db
      .insert(transactionsTable)
      .values({
        type: "dues_payment",
        scoutId: body.data.memberType === "scout" ? body.data.memberId : null,
        leaderId: body.data.memberType === "leader" ? body.data.memberId : null,
        bankAccountId: body.data.bankAccountId,
        amountCents: a.amountCents,
        description: "Deposit applied to dues",
      })
      .returning();
    await db
      .update(duesTable)
      .set({
        isPaid: a.fullyPaid,
        paidAt: a.fullyPaid ? new Date() : entry.paidAt,
        updatedAt: new Date(),
      })
      .where(eq(duesTable.id, a.duesId));
    await logDuesTransaction(
      entry.id,
      a.fullyPaid ? "payment_recorded" : "partial_payment",
      (req as Request & { user?: { id: string } }).user?.id,
      a.amountCents,
      a.fullyPaid,
      entry.isWaived,
      "Deposit applied",
      tx?.id,
    );
  }

  // Create scout_deposit transaction only for remaining balance after applying to dues.
  if (balance > 0) {
    await db.insert(transactionsTable).values({
      type: "scout_deposit",
      scoutId: body.data.memberType === "scout" ? body.data.memberId : null,
      leaderId: body.data.memberType === "leader" ? body.data.memberId : null,
      bankAccountId: body.data.bankAccountId,
      amountCents: balance,
      description: "Deposit",
    });
  }

  res.json({
    applied: applied.map((a) => ({ duesId: a.duesId, amountCents: a.amountCents })),
    remaining: balance,
    totalApplied: body.data.amountCents - balance,
  });
});

router.patch("/:id/waive", requireAuth, async (req, res) => {
  const body = z
    .object({
      waived: z.boolean(),
      note: z.string().trim().max(512).optional().or(z.literal("").transform(() => undefined)),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid waive request" });
    return;
  }

  const [dues] = await db
    .update(duesTable)
    .set({ isWaived: body.data.waived, updatedAt: new Date() })
    .where(eq(duesTable.id, String(req.params.id)))
    .returning();
  if (!dues) {
    res.status(404).json({ error: "Dues entry not found" });
    return;
  }

  await logDuesTransaction(
    dues.id,
    body.data.waived ? "waived" : "unwaived",
    (req as Request & { user?: { id: string } }).user?.id,
    dues.amountCents,
    dues.isPaid,
    dues.isWaived,
    body.data.note,
    undefined,
  );

  res.json(dues);
});

router.patch("/:id/toggle", requireAuth, async (req, res) => {
  const [dues] = await db
    .update(duesTable)
    .set({
      isPaid: sql`NOT ${duesTable.isPaid}`,
      paidAt: sql`case when ${duesTable.isPaid} = false then now() else null end`,
      updatedAt: new Date(),
    })
    .where(eq(duesTable.id, String(req.params.id)))
    .returning();
  if (!dues) {
    res.status(404).json({ error: "Dues entry not found" });
    return;
  }

  const action = dues.isPaid ? "marked_unpaid" : "marked_paid";
  await logDuesTransaction(
    dues.id,
    action,
    (req as Request & { user?: { id: string } }).user?.id,
    dues.amountCents,
    dues.isPaid,
    dues.isWaived,
    undefined,
    undefined,
  );

  res.json(dues);
});

router.patch("/:id", requireAuth, async (req, res) => {
  const body = z
    .object({
      amountCents: z.number().int().min(0).optional(),
      isPaid: z.boolean().optional(),
      isWaived: z.boolean().optional(),
      dueDate: z.string().optional(),
      notes: z.string().trim().max(512).optional().or(z.literal("").transform(() => undefined)),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid dues data" });
    return;
  }

  const [dues] = await db
    .update(duesTable)
    .set({
      amountCents: body.data.amountCents,
      isPaid: body.data.isPaid,
      isWaived: body.data.isWaived,
      dueDate: body.data.dueDate ? new Date(body.data.dueDate).toISOString().slice(0, 10) : null,
      notes: body.data.notes,
      updatedAt: new Date(),
    })
    .where(eq(duesTable.id, String(req.params.id)))
    .returning();
  if (!dues) {
    res.status(404).json({ error: "Dues entry not found" });
    return;
  }
  res.json(dues);
});

router.delete("/:id", requireAuth, async (req, res) => {
  const [dues] = await db
    .select()
    .from(duesTable)
    .where(eq(duesTable.id, String(req.params.id)))
    .limit(1);
  if (!dues) {
    res.status(404).json({ error: "Dues entry not found" });
    return;
  }
  await db.delete(duesTable).where(eq(duesTable.id, dues.id));
  res.json({ ok: true });
});

// ── Add members to a cycle (retroactive) ─────────────────────────────────

router.post("/cycles/:cycleId/add-members", requireAuth, async (req, res) => {
  const cycleId = String(req.params.cycleId);

  const body = z
    .object({
      members: z.array(
        z.object({
          memberType: z.enum(["scout", "leader"]),
          memberId: z.string().uuid(),
        }),
      ),
    })
    .safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid members data" });
    return;
  }

  // Fetch cycle to get rates.
  const [cycle] = await db
    .select({
      scoutAmountCents: duesCyclesTable.scoutAmountCents,
      leaderAmountCents: duesCyclesTable.leaderAmountCents,
      label: duesCyclesTable.label,
    })
    .from(duesCyclesTable)
    .where(eq(duesCyclesTable.id, cycleId))
    .limit(1);
  if (!cycle) {
    res.status(404).json({ error: "Cycle not found" });
    return;
  }

  // Insert only members not already in the cycle.
  const existing = await db
    .select({ memberId: duesTable.memberId, memberType: duesTable.memberType })
    .from(duesTable)
    .where(eq(duesTable.cycleId, cycleId));

  const existingSet = new Set(existing.map((e) => `${e.memberType}:${e.memberId}`));

  const toInsert = body.data.members.filter(
    (m) => !existingSet.has(`${m.memberType}:${m.memberId}`),
  );

  if (toInsert.length === 0) {
    res.json({ added: 0, message: "All members already in cycle" });
    return;
  }

  const entries = toInsert.map((m) => ({
    cycleId,
    memberType: m.memberType,
    memberId: m.memberId,
    amountCents: m.memberType === "scout" ? cycle.scoutAmountCents : cycle.leaderAmountCents,
  }));

  const inserted = await db.insert(duesTable).values(entries).returning();

  // Create dues_assessed ledger transactions for each added member.
  for (const d of inserted) {
    await db.insert(transactionsTable).values({
      type: "dues_assessed" as const,
      scoutId: d.memberType === "scout" ? d.memberId : null,
      leaderId: d.memberType === "leader" ? d.memberId : null,
      amountCents: -d.amountCents,
      description: `${cycle.label} Dues`,
    });
    await logDuesTransaction(
      d.id,
      "added_to_cycle",
      (req as Request & { user?: { id: string } }).user?.id,
      d.amountCents,
      false,
      false,
      "Added to cycle retroactively",
      undefined,
    );
  }

  res.status(201).json({ added: inserted.length });
});

// ── Auto-generate dues entries for a cycle ───────────────────────────────

router.post("/cycles/:cycleId/generate", requireAuth, async (req, res) => {
  const cycleId = String(req.params.cycleId);

  // Verify cycle exists.
  const [cycle] = await db
    .select({
      scoutAmountCents: duesCyclesTable.scoutAmountCents,
      leaderAmountCents: duesCyclesTable.leaderAmountCents,
      label: duesCyclesTable.label,
    })
    .from(duesCyclesTable)
    .where(eq(duesCyclesTable.id, cycleId))
    .limit(1);
  if (!cycle) {
    res.status(404).json({ error: "Cycle not found" });
    return;
  }

  // Remove existing entries for this cycle.
  await db.delete(duesTable).where(eq(duesTable.cycleId, cycleId));

  // Collect active scouts.
  const scouts = await db
    .select({
      id: scoutsTable.id,
      duesAmountOverrideCents: scoutsTable.duesAmountOverrideCents,
    })
    .from(scoutsTable)
    .where(eq(scoutsTable.isActive, true));

  // Collect active leaders.
  const leaders = await db
    .select({
      id: leadersTable.id,
      duesAmountOverrideCents: leadersTable.duesAmountOverrideCents,
    })
    .from(leadersTable)
    .where(eq(leadersTable.isActive, true));

  const entries = [
    ...scouts.map((s) => ({
      cycleId,
      memberType: "scout" as const,
      memberId: s.id,
      amountCents: s.duesAmountOverrideCents ?? cycle.scoutAmountCents,
    })),
    ...leaders.map((l) => ({
      cycleId,
      memberType: "leader" as const,
      memberId: l.id,
      amountCents: l.duesAmountOverrideCents ?? cycle.leaderAmountCents,
    })),
  ];

  const inserted = await db.insert(duesTable).values(entries).returning();

  // Create dues_assessed transactions for each member.
  for (const d of inserted) {
    await db.insert(transactionsTable).values({
      type: "dues_assessed" as const,
      scoutId: d.memberType === "scout" ? d.memberId : null,
      leaderId: d.memberType === "leader" ? d.memberId : null,
      amountCents: -d.amountCents,
      description: `${cycle.label} Dues`,
    });
    await logDuesTransaction(
      d.id,
      "generated",
      undefined,
      d.amountCents,
      false,
      false,
      "Auto-generated for cycle",
      undefined,
    );
  }

  res.status(201).json(inserted);
});

// ── Dues payment history / audit trail ───────────────────────────────────

router.get("/:duesId/history", requireAuth, async (req, res) => {
  const history = await db
    .select({
      id: duesTransactionsTable.id,
      action: duesTransactionsTable.action,
      userId: duesTransactionsTable.userId,
      amountCents: duesTransactionsTable.amountCents,
      isPaid: duesTransactionsTable.isPaid,
      isWaived: duesTransactionsTable.isWaived,
      note: duesTransactionsTable.note,
      transactionId: duesTransactionsTable.transactionId,
      createdAt: duesTransactionsTable.createdAt,
    })
    .from(duesTransactionsTable)
    .where(eq(duesTransactionsTable.duesId, String(req.params.duesId)))
    .orderBy(duesTransactionsTable.createdAt);
  res.json(history);
});

router.get("/:duesId/transactions", requireAuth, async (req, res) => {
  const transactions = await db
    .select({
      id: duesTransactionsTable.id,
      action: duesTransactionsTable.action,
      userId: duesTransactionsTable.userId,
      amountCents: duesTransactionsTable.amountCents,
      isPaid: duesTransactionsTable.isPaid,
      isWaived: duesTransactionsTable.isWaived,
      note: duesTransactionsTable.note,
      transactionId: duesTransactionsTable.transactionId,
      createdAt: duesTransactionsTable.createdAt,
    })
    .from(duesTransactionsTable)
    .where(eq(duesTransactionsTable.duesId, String(req.params.duesId)))
    .orderBy(duesTransactionsTable.createdAt);
  res.json(transactions);
});

// ── Dues breakdown per member for a cycle ────────────────────────────────

router.get("/cycles/:cycleId/breakdown", requireAuth, async (req, res) => {
  const cycleId = String(req.params.cycleId);

  const [cycle] = await db
    .select({ label: duesCyclesTable.label })
    .from(duesCyclesTable)
    .where(eq(duesCyclesTable.id, cycleId))
    .limit(1);

  if (!cycle) {
    res.status(404).json({ error: "Cycle not found" });
    return;
  }

  // Fetch base dues entries.
  const entries = await db
    .select({
      id: duesTable.id,
      memberType: duesTable.memberType,
      memberId: duesTable.memberId,
      amountCents: duesTable.amountCents,
      isPaid: duesTable.isPaid,
      isWaived: duesTable.isWaived,
      paidAt: duesTable.paidAt,
      dueDate: duesTable.dueDate,
    })
    .from(duesTable)
    .where(eq(duesTable.cycleId, cycleId))
    .orderBy(duesTable.memberType, duesTable.memberId);

  // Batch member names (avoids per-entry queries).
  const scoutIds = [
    ...new Set(entries.filter((e) => e.memberType === "scout" && e.memberId).map((e) => e.memberId as string)),
  ];
  const leaderIds = [
    ...new Set(entries.filter((e) => e.memberType === "leader" && e.memberId).map((e) => e.memberId as string)),
  ];
  const [scoutNames, leaderNames] = await Promise.all([
    scoutIds.length
      ? db
          .select({ id: scoutsTable.id, name: sql<string>`first_name || ' ' || last_name` })
          .from(scoutsTable)
          .where(inArray(scoutsTable.id, scoutIds))
      : Promise.resolve([] as Array<{ id: string; name: string }>),
    leaderIds.length
      ? db
          .select({ id: leadersTable.id, name: sql<string>`first_name || ' ' || last_name` })
          .from(leadersTable)
          .where(inArray(leadersTable.id, leaderIds))
      : Promise.resolve([] as Array<{ id: string; name: string }>),
  ]);
  const scoutNameMap = new Map(scoutNames.map((s) => [s.id, s.name]));
  const leaderNameMap = new Map(leaderNames.map((l) => [l.id, l.name]));

  // Paid-to-date, remaining, effective isPaid, and status from the audit trail.
  const results = (await withDuesPaymentState(entries)).map((entry) => {
    const memberName = entry.memberId
      ? entry.memberType === "scout"
        ? scoutNameMap.get(entry.memberId) || "—"
        : leaderNameMap.get(entry.memberId) || "—"
      : "—";
    return {
      id: entry.id,
      memberType: entry.memberType,
      memberId: entry.memberId,
      amountCents: entry.amountCents,
      isPaid: entry.isPaid,
      isWaived: entry.isWaived,
      paidAt: entry.paidAt,
      dueDate: entry.dueDate,
      status: entry.status,
      amountPaidCents: entry.amountPaidCents,
      remainingCents: entry.remainingCents,
      memberName,
    };
  });

  res.json(results);
});

// ── Dues summary report ──────────────────────────────────────────────────

router.get("/reports/summary", requireAuth, async (req, res) => {
  const cycleId = req.query.cycleId as string | undefined;
  const conditions = cycleId && cycleId !== "" ? and(eq(duesTable.cycleId, cycleId)) : undefined;

  // Paid counts the actual amount received (partial payments included),
  // capped at the assessed amount. Waived entries count as fully waived and
  // contribute nothing to paid/outstanding.
  const paidSub = sql<number>`(select sum(dt.amount_cents) from dues_transactions dt where dt.dues_id = ${duesTable.id} and dt.action in ('payment','payment_recorded','partial_payment'))`;
  const summary = await db
    .select({
      totalAmountCents: sql<number>`COALESCE(SUM(${duesTable.amountCents}), 0)`,
      paidAmountCents: sql<number>`COALESCE(SUM(CASE WHEN ${duesTable.isWaived} THEN 0 WHEN ${duesTable.isPaid} THEN ${duesTable.amountCents} ELSE LEAST(${duesTable.amountCents}, coalesce(${paidSub}, 0)) END), 0)`,
      waivedAmountCents: sql<number>`COALESCE(SUM(CASE WHEN ${duesTable.isWaived} THEN ${duesTable.amountCents} ELSE 0 END), 0)`,
      scoutTotalCents: sql<number>`COALESCE(SUM(CASE WHEN ${duesTable.memberType} = 'scout' THEN ${duesTable.amountCents} ELSE 0 END), 0)`,
      scoutPaidCents: sql<number>`COALESCE(SUM(CASE WHEN ${duesTable.memberType} = 'scout' THEN CASE WHEN ${duesTable.isWaived} THEN 0 WHEN ${duesTable.isPaid} THEN ${duesTable.amountCents} ELSE LEAST(${duesTable.amountCents}, coalesce(${paidSub}, 0)) END ELSE 0 END), 0)`,
      leaderTotalCents: sql<number>`COALESCE(SUM(CASE WHEN ${duesTable.memberType} = 'leader' THEN ${duesTable.amountCents} ELSE 0 END), 0)`,
      leaderPaidCents: sql<number>`COALESCE(SUM(CASE WHEN ${duesTable.memberType} = 'leader' THEN CASE WHEN ${duesTable.isWaived} THEN 0 WHEN ${duesTable.isPaid} THEN ${duesTable.amountCents} ELSE LEAST(${duesTable.amountCents}, coalesce(${paidSub}, 0)) END ELSE 0 END), 0)`,
      memberCount: sql<number>`COUNT(*)`,
      paidCount: sql<number>`COUNT(CASE WHEN ${duesTable.isPaid} OR (${duesTable.isWaived} = false AND ${duesTable.amountCents} > 0 AND coalesce(${paidSub}, 0) >= ${duesTable.amountCents}) THEN 1 END)`,
    })
    .from(duesTable)
    .where(conditions)
    .limit(1);

  const row = summary[0] || {};
  res.json({
    summary: {
      totalAmountCents: Number(row.totalAmountCents ?? 0),
      paidAmountCents: Number(row.paidAmountCents ?? 0),
      waivedAmountCents: Number(row.waivedAmountCents ?? 0),
      scoutTotalCents: Number(row.scoutTotalCents ?? 0),
      scoutPaidCents: Number(row.scoutPaidCents ?? 0),
      leaderTotalCents: Number(row.leaderTotalCents ?? 0),
      leaderPaidCents: Number(row.leaderPaidCents ?? 0),
      memberCount: Number(row.memberCount ?? 0),
      paidCount: Number(row.paidCount ?? 0),
    },
    breakdowns: [],
    totalRows: Number(row.memberCount ?? 0),
  });
});

export default router;
