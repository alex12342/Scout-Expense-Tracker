import { Router } from "express";
import {
  db,
  scoutsTable,
  bankAccountsTable,
  eventsTable,
  eventParticipantsTable,
} from "@scout-expense-tracker/db";
import { inArray, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getScoutBalance, getBankBalance } from "../lib/queries";

const router = Router();

// GET / — troop-wide snapshot for the dashboard.
router.get("/", requireAuth, async (_req, res) => {
  const [scouts, accounts, events] = await Promise.all([
    db.select().from(scoutsTable).orderBy(scoutsTable.name),
    db.select().from(bankAccountsTable).orderBy(bankAccountsTable.name),
    db.select().from(eventsTable).orderBy(desc(eventsTable.eventDate)).limit(100),
  ]);

  const [scoutBalances, accountBalances, eventAgg] = await Promise.all([
    Promise.all(scouts.map((s) => getScoutBalance(s.id))),
    Promise.all(accounts.map((a) => getBankBalance(a.id))),
    events.length
      ? db
          .select({
            eventId: eventParticipantsTable.eventId,
            allocated: sql<number>`coalesce(sum(${eventParticipantsTable.amountAllocatedCents}),0)`,
            paid: sql<number>`coalesce(sum(${eventParticipantsTable.amountPaidCents}),0)`,
            n: sql<number>`count(*)`,
          })
          .from(eventParticipantsTable)
          .where(inArray(eventParticipantsTable.eventId, events.map((e) => e.id)))
          .groupBy(eventParticipantsTable.eventId)
      : Promise.resolve([]),
  ]);

  const aggMap = new Map(eventAgg.map((a) => [a.eventId, a]));

  const scoutRows = scouts.map((s, i) => ({
    ...s,
    balanceCents: scoutBalances[i],
  }));
  const accountRows = accounts.map((a, i) => ({
    ...a,
    balanceCents: accountBalances[i],
  }));
  const eventRows = events.map((e) => {
    const a = aggMap.get(e.id);
    const allocated = Number(a?.allocated ?? 0);
    const paid = Number(a?.paid ?? 0);
    return {
      ...e,
      totalAllocatedCents: allocated,
      totalPaidCents: paid,
      outstandingCents: allocated - paid,
      participantCount: Number(a?.n ?? 0),
      isPaid: allocated > 0 && paid >= allocated,
    };
  });

  const creditCents = scoutRows
    .filter((s) => s.isActive && s.balanceCents > 0)
    .reduce((sum, s) => sum + s.balanceCents, 0);
  const debtCents = scoutRows
    .filter((s) => s.isActive && s.balanceCents < 0)
    .reduce((sum, s) => sum - s.balanceCents, 0);
  const outstandingCents = eventRows.reduce(
    (sum, e) => sum + Math.max(0, e.outstandingCents),
    0,
  );

  res.json({
    accounts: accountRows,
    scouts: scoutRows,
    events: eventRows,
    totals: {
      bankTotalCents: accountRows.reduce((s, a) => s + a.balanceCents, 0),
      checkingCents: accountRows
        .filter((a) => a.accountType === "checking")
        .reduce((s, a) => s + a.balanceCents, 0),
      savingsCents: accountRows
        .filter((a) => a.accountType === "savings")
        .reduce((s, a) => s + a.balanceCents, 0),
      scoutCreditCents: creditCents,
      scoutDebtCents: debtCents,
      eventsOutstandingCents: outstandingCents,
    },
  });
});

export default router;
