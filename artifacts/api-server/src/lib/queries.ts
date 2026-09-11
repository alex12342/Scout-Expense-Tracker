import {
  db,
  transactionsTable,
  scoutsTable,
  leadersTable,
  bankAccountsTable,
} from "@scout-expense-tracker/db";
import { sql, and, eq } from "drizzle-orm";
import type { Transaction, Scout, BankAccount, Leader } from "@scout-expense-tracker/db";

/** Scout balance = SUM(amountCents) over the scout's ledger. */
export async function getScoutBalance(scoutId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${transactionsTable.amountCents}), 0)`,
    })
    .from(transactionsTable)
    .where(eq(transactionsTable.scoutId, scoutId));
  return Number(row?.total ?? 0);
}

/** Leader balance = SUM(amountCents) over the leader's ledger. */
export async function getLeaderBalance(leaderId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${transactionsTable.amountCents}), 0)`,
    })
    .from(transactionsTable)
    .where(eq(transactionsTable.leaderId, leaderId));
  return Number(row?.total ?? 0);
}

/** Bank account balance = SUM(amountCents) over the account's ledger. */
export async function getBankBalance(accountId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${transactionsTable.amountCents}), 0)`,
    })
    .from(transactionsTable)
    .where(eq(transactionsTable.bankAccountId, accountId));
  return Number(row?.total ?? 0);
}

export async function listScoutsWithBalances(): Promise<
  (Scout & { balanceCents: number })[]
> {
  const scouts = await db.select().from(scoutsTable).orderBy(scoutsTable.name);
  const balances = await Promise.all(scouts.map((s) => getScoutBalance(s.id)));
  return scouts.map((s, i) => ({ ...s, balanceCents: balances[i] }));
}

export async function listBankAccountsWithBalances(): Promise<
  (BankAccount & { balanceCents: number })[]
> {
  const accounts = await db
    .select()
    .from(bankAccountsTable)
    .orderBy(bankAccountsTable.name);
  const balances = await Promise.all(
    accounts.map((a) => getBankBalance(a.id)),
  );
  return accounts.map((a, i) => ({ ...a, balanceCents: balances[i] }));
}

export async function listLedger(opts?: {
  scoutId?: string;
  leaderId?: string;
  bankAccountId?: string;
  limit?: number;
  offset?: number;
}): Promise<
  (Transaction & {
    scoutName: string | null;
    leaderName: string | null;
    bankAccountName: string | null;
  })[]
> {
  const conditions = [];
  if (opts?.scoutId)
    conditions.push(eq(transactionsTable.scoutId, opts.scoutId));
  if (opts?.leaderId)
    conditions.push(eq(transactionsTable.leaderId, opts.leaderId));
  if (opts?.bankAccountId)
    conditions.push(eq(transactionsTable.bankAccountId, opts.bankAccountId));

  const rows = await db
    .select({
      tx: transactionsTable,
      scoutName: scoutsTable.name,
      leaderName: leadersTable.name,
      bankAccountName: bankAccountsTable.name,
    })
    .from(transactionsTable)
    .leftJoin(
      scoutsTable,
      eq(transactionsTable.scoutId, scoutsTable.id),
    )
    .leftJoin(
      leadersTable,
      eq(transactionsTable.leaderId, leadersTable.id),
    )
    .leftJoin(
      bankAccountsTable,
      eq(transactionsTable.bankAccountId, bankAccountsTable.id),
    )
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(transactionsTable.occurredAt, transactionsTable.createdAt)
    .limit(opts?.limit ?? 500)
    .offset(opts?.offset ?? 0);

  return rows.map((r) => ({
    ...r.tx,
    scoutName: r.scoutName,
    leaderName: r.leaderName,
    bankAccountName: r.bankAccountName,
  }));
}
