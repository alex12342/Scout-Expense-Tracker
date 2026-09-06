import { pgTable, varchar, timestamp, integer, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { scoutsTable } from "./scouts";
import { bankAccountsTable } from "./bankAccounts";
import { eventsTable, eventParticipantsTable } from "./events";
import { usersTable } from "./users";

/**
 * The kinds of money movement the troop records. `amountCents` is ALWAYS
 * signed from the TROOP's perspective:
 *   positive = money in / a credit to the ledger
 *   negative = money out / a debit to the ledger
 *
 * How each type lands in the two ledgers (both are just SUM(amountCents)):
 *
 *   type               scout ledger   bank account
 *   -----------------  -------------  --------------
 *   opening_balance    ± (scout)      ± (account)
 *   scout_deposit      + (paid in)    + (money in)
 *   reimbursement      - (paid out)   - (money out)
 *   event_allocation   - (now owes)   — (no cash yet)
 *   event_payment      + (paid share) + (money in)
 *   event_refund       - (share back) - (money out)
 *   bank_expense       —              - (money out)
 *   bank_adjustment    —              ± (correction)
 *   scout_adjustment   ± (correction) —
 *
 * Scout balance  = SUM(amountCents) WHERE scout_id = X
 *   -> positive: troop owes the scout (credit)
 *   -> negative: the scout owes the troop
 * Bank balance   = SUM(amountCents) WHERE bank_account_id = Y
 */
export const TRANSACTION_TYPES = [
  "opening_balance",
  "scout_deposit",
  "reimbursement",
  "event_allocation",
  "event_payment",
  "event_refund",
  "bank_expense",
  "bank_adjustment",
  "scout_adjustment",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const transactionsTable = pgTable("transactions", {
  id: uuid("id")
    .notNull()
    .default(sql`(gen_random_uuid())`)
    .primaryKey(),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  type: varchar("type", { length: 32 })
    .notNull()
    .$type<TransactionType>(),
  // Signed integer cents (troop perspective). See the block comment above.
  amountCents: integer("amount_cents").notNull(),
  // Which ledgers this row touches. A row may touch one or both.
  scoutId: uuid("scout_id").references(() => scoutsTable.id, {
    onDelete: "set null",
  }),
  bankAccountId: uuid("bank_account_id").references(() => bankAccountsTable.id, {
    onDelete: "set null",
  }),
  // Event linkage (for event_allocation / event_payment rows).
  eventId: uuid("event_id").references(() => eventsTable.id, {
    onDelete: "set null",
  }),
  eventParticipantId: uuid("event_participant_id").references(
    () => eventParticipantsTable.id,
    { onDelete: "set null" },
  ),
  description: varchar("description", { length: 512 }),
  createdBy: uuid("created_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Transaction = typeof transactionsTable.$inferSelect;
export type NewTransaction = typeof transactionsTable.$inferInsert;
