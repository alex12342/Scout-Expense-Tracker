import { Router } from "express";
import {
  db,
  transactionsTable,
  scoutsTable,
  leadersTable,
  bankAccountsTable,
  eventsTable,
  eventParticipantsTable,
  duesCyclesTable,
  duesTable,
  TRANSACTION_TYPES,
} from "@scout-expense-tracker/db";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

// ── GET /reports ──────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  const type = typeof req.query.type === "string" ? req.query.type : "";

  if (type === "transactions") {
    return res.json(await generateTransactionsReport(req.query));
  }
  if (type === "scout-summary") {
    return res.json(await generateScoutSummaryReport(req.query));
  }
  if (type === "leader-summary") {
    return res.json(await generateLeaderSummaryReport(req.query));
  }
  if (type === "event-summary") {
    return res.json(await generateEventSummaryReport(req.query));
  }
  if (type === "dues-summary") {
    return res.json(await generateDuesSummaryReport(req.query));
  }

  res.status(400).json({ error: "Invalid report type" });
});

// ── 1. Transactions report ────────────────────────────────────────────────
async function generateTransactionsReport(query: Record<string, unknown>) {
  const conditions = [];

  const scoutId = typeof query.scoutId === "string" ? query.scoutId : undefined;
  const leaderId = typeof query.leaderId === "string" ? query.leaderId : undefined;
  const bankAccountId =
    typeof query.bankAccountId === "string" ? query.bankAccountId : undefined;
  const transactionType =
    typeof query.transactionType === "string" ? query.transactionType : undefined;
  const from = typeof query.from === "string" ? query.from : undefined;
  const to = typeof query.to === "string" ? query.to : undefined;

  if (scoutId) conditions.push(eq(transactionsTable.scoutId, scoutId));
  if (leaderId) conditions.push(eq(transactionsTable.leaderId, leaderId));
  if (bankAccountId)
    conditions.push(eq(transactionsTable.bankAccountId, bankAccountId));
  if (transactionType)
    conditions.push(eq(transactionsTable.type, transactionType as any));
  if (from) conditions.push(gte(transactionsTable.occurredAt, new Date(from)));
  if (to) conditions.push(lte(transactionsTable.occurredAt, new Date(to)));

  const rows = await db
    .select({
      tx: transactionsTable,
      scoutName: scoutsTable.name,
      leaderName: leadersTable.name,
      bankAccountName: bankAccountsTable.name,
    })
    .from(transactionsTable)
    .leftJoin(scoutsTable, eq(transactionsTable.scoutId, scoutsTable.id))
    .leftJoin(leadersTable, eq(transactionsTable.leaderId, leadersTable.id))
    .leftJoin(
      bankAccountsTable,
      eq(transactionsTable.bankAccountId, bankAccountsTable.id),
    )
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(transactionsTable.occurredAt), desc(transactionsTable.createdAt))
    .limit(2000);

  return {
    type: "transactions",
    rows: rows.map((r) => ({
      ...r.tx,
      scoutName: r.scoutName,
      leaderName: r.leaderName,
      bankAccountName: r.bankAccountName,
    })),
    totalRows: rows.length,
  };
}

// ── 2. Scout summary report ───────────────────────────────────────────────
async function generateScoutSummaryReport(query: Record<string, unknown>) {
  const isActive = typeof query.isActive === "string" ? query.isActive : "";
  const scouts = await db
    .select()
    .from(scoutsTable)
    .where(
      isActive
        ? eq(scoutsTable.isActive, isActive === "true")
        : undefined,
    )
    .orderBy(scoutsTable.name);

  const rows = await Promise.all(
    scouts.map(async (scout) => {
      const balance = await db
        .select({
          total: sql<number>`coalesce(sum(${transactionsTable.amountCents}), 0)`,
        })
        .from(transactionsTable)
        .where(eq(transactionsTable.scoutId, scout.id));

      const deposits = await db
        .select({
          total: sql<number>`coalesce(sum(case when ${transactionsTable.type} = 'scout_deposit' then ${transactionsTable.amountCents} else 0 end), 0)`,
        })
        .from(transactionsTable)
        .where(eq(transactionsTable.scoutId, scout.id));

      const eventPayments = await db
        .select({
          total: sql<number>`coalesce(sum(case when ${transactionsTable.type} = 'event_payment' then ${transactionsTable.amountCents} else 0 end), 0)`,
        })
        .from(transactionsTable)
        .where(eq(transactionsTable.scoutId, scout.id));

      const eventAllocations = await db
        .select({
          total: sql<number>`coalesce(sum(case when ${transactionsTable.type} = 'event_allocation' then ${transactionsTable.amountCents} else 0 end), 0)`,
        })
        .from(transactionsTable)
        .where(eq(transactionsTable.scoutId, scout.id));

      return {
        scoutId: scout.id,
        name: scout.name,
        firstName: scout.firstName,
        lastName: scout.lastName,
        rank: scout.rank,
        bsaNumber: scout.bsaNumber,
        balanceCents: Number(balance[0]?.total ?? 0),
        totalDepositsCents: Number(deposits[0]?.total ?? 0),
        totalEventPaymentsCents: Number(eventPayments[0]?.total ?? 0),
        totalEventAllocationsCents: Number(eventAllocations[0]?.total ?? 0),
        isActive: scout.isActive,
      };
    }),
  );

  return { type: "scout-summary", rows, totalRows: rows.length };
}

// ── 3. Leader summary report ──────────────────────────────────────────────
async function generateLeaderSummaryReport(query: Record<string, unknown>) {
  const isActive = typeof query.isActive === "string" ? query.isActive : "";
  const leaders = await db
    .select()
    .from(leadersTable)
    .where(
      isActive
        ? eq(leadersTable.isActive, isActive === "true")
        : undefined,
    )
    .orderBy(leadersTable.name);

  const rows = await Promise.all(
    leaders.map(async (leader) => {
      const balance = await db
        .select({
          total: sql<number>`coalesce(sum(${transactionsTable.amountCents}), 0)`,
        })
        .from(transactionsTable)
        .where(eq(transactionsTable.leaderId, leader.id));

      const deposits = await db
        .select({
          total: sql<number>`coalesce(sum(case when ${transactionsTable.type} = 'scout_deposit' then ${transactionsTable.amountCents} else 0 end), 0)`,
        })
        .from(transactionsTable)
        .where(eq(transactionsTable.leaderId, leader.id));

      const eventPayments = await db
        .select({
          total: sql<number>`coalesce(sum(case when ${transactionsTable.type} = 'event_payment' then ${transactionsTable.amountCents} else 0 end), 0)`,
        })
        .from(transactionsTable)
        .where(eq(transactionsTable.leaderId, leader.id));

      const eventAllocations = await db
        .select({
          total: sql<number>`coalesce(sum(case when ${transactionsTable.type} = 'event_allocation' then ${transactionsTable.amountCents} else 0 end), 0)`,
        })
        .from(transactionsTable)
        .where(eq(transactionsTable.leaderId, leader.id));

      return {
        leaderId: leader.id,
        name: leader.name,
        firstName: leader.firstName,
        lastName: leader.lastName,
        position: leader.position,
        balanceCents: Number(balance[0]?.total ?? 0),
        totalDepositsCents: Number(deposits[0]?.total ?? 0),
        totalEventPaymentsCents: Number(eventPayments[0]?.total ?? 0),
        totalEventAllocationsCents: Number(eventAllocations[0]?.total ?? 0),
        isActive: leader.isActive,
      };
    }),
  );

  return { type: "leader-summary", rows, totalRows: rows.length };
}

// ── 4. Event summary report ───────────────────────────────────────────────
async function generateEventSummaryReport(query: Record<string, unknown>) {
  const from = typeof query.from === "string" ? query.from : undefined;
  const to = typeof query.to === "string" ? query.to : undefined;
  const conditions = [];
  if (from) conditions.push(gte(eventsTable.eventDate, from));
  if (to) conditions.push(lte(eventsTable.eventDate, to));

  const events = await db
    .select({
      id: eventsTable.id,
      name: eventsTable.name,
      eventDate: eventsTable.eventDate,
      description: eventsTable.description,
      totalCostCents: eventsTable.totalCostCents,
      totalPaid: sql<number>`coalesce(sum(${eventParticipantsTable.amountPaidCents}), 0)`,
      participantCount: sql<number>`count(${eventParticipantsTable.id})`,
    })
    .from(eventsTable)
    .leftJoin(
      eventParticipantsTable,
      eq(eventsTable.id, eventParticipantsTable.eventId),
    )
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(eventsTable.id)
    .orderBy(desc(eventsTable.eventDate));

  const rows = events.map((e) => ({
    eventId: e.id,
    name: e.name,
    eventDate: e.eventDate,
    description: e.description,
    totalCostCents: e.totalCostCents,
    totalPaidCents: Number(e.totalPaid),
    outstandingCents: e.totalCostCents - Number(e.totalPaid),
    participantCount: Number(e.participantCount),
  }));

  return { type: "event-summary", rows, totalRows: rows.length };
}

// ── 5. Dues summary report ────────────────────────────────────────────────
async function generateDuesSummaryReport(query: Record<string, unknown>) {
  const cycleId =
    typeof query.cycleId === "string" ? query.cycleId : undefined;
  const conditions = cycleId ? [eq(duesCyclesTable.id, cycleId)] : undefined;

  const cycles = await db
    .select({
      cycleId: duesCyclesTable.id,
      label: duesCyclesTable.label,
      isCurrent: duesCyclesTable.isCurrent,
      totalDue: sql<number>`coalesce(sum(${duesTable.amountCents}), 0)`,
      totalPaid: sql<number>`coalesce(sum(case when ${duesTable.isPaid} then ${duesTable.amountCents} else 0 end), 0)`,
      memberCount: sql<number>`count(${duesTable.id})`,
      paidCount: sql<number>`count(case when ${duesTable.isPaid} then 1 end)`,
    })
    .from(duesCyclesTable)
    .leftJoin(duesTable, eq(duesCyclesTable.id, duesTable.cycleId))
    .where(cycleId ? and(eq(duesCyclesTable.id, cycleId)) : undefined)
    .groupBy(duesCyclesTable.id)
    .orderBy(desc(duesCyclesTable.createdAt));

  const rows = cycles.map((c) => ({
    cycleId: c.cycleId,
    label: c.label,
    isCurrent: c.isCurrent,
    totalDueCents: Number(c.totalDue),
    totalPaidCents: Number(c.totalPaid),
    outstandingCents: Number(c.totalDue) - Number(c.totalPaid),
    memberCount: Number(c.memberCount),
    paidCount: Number(c.paidCount),
  }));

  return { type: "dues-summary", rows, totalRows: rows.length };
}

export default router;
