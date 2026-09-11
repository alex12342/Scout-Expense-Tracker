import { Router } from "express";
import {
  db,
  scoutsTable,
  leadersTable,
  bankAccountsTable,
  eventsTable,
  eventParticipantsTable,
  duesTable,
} from "@scout-expense-tracker/db";
import { inArray, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getScoutBalance, getBankBalance, getLeaderBalance } from "../lib/queries";

const router = Router();

// GET / — troop-wide snapshot for the dashboard.
router.get("/", requireAuth, async (_req, res) => {
  const [scouts, leaders, accounts, events, duesSummary] = await Promise.all([
    db.select().from(scoutsTable).orderBy(scoutsTable.name),
    db.select().from(leadersTable).orderBy(leadersTable.firstName),
    db.select().from(bankAccountsTable).orderBy(bankAccountsTable.name),
    db.select().from(eventsTable).orderBy(desc(eventsTable.eventDate)).limit(100),
    db
      .select({
        scoutTotalAssessed: sql<number>`coalesce(sum(CASE WHEN ${duesTable.memberType} = 'scout' THEN ${duesTable.amountCents} ELSE 0 END),0)`,
        scoutPaid: sql<number>`coalesce(sum(CASE WHEN ${duesTable.memberType} = 'scout' AND ${duesTable.isPaid} THEN ${duesTable.amountCents} ELSE 0 END),0)`,
        scoutOutstanding: sql<number>`coalesce(sum(CASE WHEN ${duesTable.memberType} = 'scout' AND ${duesTable.isPaid} = false AND ${duesTable.isWaived} = false THEN ${duesTable.amountCents} ELSE 0 END),0)`,
        leaderTotalAssessed: sql<number>`coalesce(sum(CASE WHEN ${duesTable.memberType} = 'leader' THEN ${duesTable.amountCents} ELSE 0 END),0)`,
        leaderPaid: sql<number>`coalesce(sum(CASE WHEN ${duesTable.memberType} = 'leader' AND ${duesTable.isPaid} THEN ${duesTable.amountCents} ELSE 0 END),0)`,
        leaderOutstanding: sql<number>`coalesce(sum(CASE WHEN ${duesTable.memberType} = 'leader' AND ${duesTable.isPaid} = false AND ${duesTable.isWaived} = false THEN ${duesTable.amountCents} ELSE 0 END),0)`,
        totalAssessed: sql<number>`coalesce(sum(${duesTable.amountCents}),0)`,
        totalPaid: sql<number>`coalesce(sum(CASE WHEN ${duesTable.isPaid} THEN ${duesTable.amountCents} ELSE 0 END),0)`,
        totalOutstanding: sql<number>`coalesce(sum(CASE WHEN ${duesTable.isPaid} = false AND ${duesTable.isWaived} = false THEN ${duesTable.amountCents} ELSE 0 END),0)`,
      })
      .from(duesTable),
  ]);

  const [scoutBalances, leaderBalances, accountBalances, eventAgg] = await Promise.all([
    Promise.all(scouts.map((s) => getScoutBalance(s.id))),
    Promise.all(leaders.map((l) => getLeaderBalance(l.id))),
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
  const leaderRows = leaders.map((l, i) => ({
    ...l,
    balanceCents: leaderBalances[i],
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

  const scoutCreditCents = scoutRows
    .filter((s) => s.isActive && s.balanceCents > 0)
    .reduce((sum, s) => sum + s.balanceCents, 0);
  const scoutDebtCents = scoutRows
    .filter((s) => s.isActive && s.balanceCents < 0)
    .reduce((sum, s) => sum - s.balanceCents, 0);
  const leaderCreditCents = leaderRows
    .filter((l) => l.isActive && l.balanceCents > 0)
    .reduce((sum, l) => sum + l.balanceCents, 0);
  const leaderDebtCents = leaderRows
    .filter((l) => l.isActive && l.balanceCents < 0)
    .reduce((sum, l) => sum - l.balanceCents, 0);
  const outstandingCents = eventRows.reduce(
    (sum, e) => sum + Math.max(0, e.outstandingCents),
    0,
  );

  const scoutRow = duesSummary[0] || {};
  const scoutAssessed = Number(scoutRow.scoutTotalAssessed ?? 0);
  const scoutPaid = Number(scoutRow.scoutPaid ?? 0);
  const scoutOutstanding = Number(scoutRow.scoutOutstanding ?? 0);
  const leaderAssessed = Number(scoutRow.leaderTotalAssessed ?? 0);
  const leaderPaid = Number(scoutRow.leaderPaid ?? 0);
  const leaderOutstanding = Number(scoutRow.leaderOutstanding ?? 0);
  const totalAssessed = Number(scoutRow.totalAssessed ?? 0);
  const totalPaid = Number(scoutRow.totalPaid ?? 0);
  const totalOutstanding = Number(scoutRow.totalOutstanding ?? 0);

  res.json({
    accounts: accountRows,
    scouts: scoutRows,
    leaders: leaderRows,
    events: eventRows,
    dues: {
      assessedCents: totalAssessed,
      paidCents: totalPaid,
      outstandingCents: totalOutstanding,
      scoutAssessedCents: scoutAssessed,
      scoutPaidCents: scoutPaid,
      scoutOutstandingCents: scoutOutstanding,
      leaderAssessedCents: leaderAssessed,
      leaderPaidCents: leaderPaid,
      leaderOutstandingCents: leaderOutstanding,
    },
    totals: {
      bankTotalCents: accountRows.reduce((s, a) => s + a.balanceCents, 0),
      checkingCents: accountRows
        .filter((a) => a.accountType === "checking")
        .reduce((s, a) => s + a.balanceCents, 0),
      savingsCents: accountRows
        .filter((a) => a.accountType === "savings")
        .reduce((s, a) => s + a.balanceCents, 0),
      scoutCreditCents: scoutCreditCents,
      scoutDebtCents: scoutDebtCents + scoutOutstanding,
      leaderCreditCents: leaderCreditCents,
      leaderDebtCents: leaderDebtCents + leaderOutstanding,
      eventsOutstandingCents: outstandingCents,
      duesOutstandingCents: totalOutstanding,
      totalOwedToTroopCents: scoutDebtCents + leaderDebtCents + outstandingCents + totalOutstanding,
    },
  });
});

export default router;
