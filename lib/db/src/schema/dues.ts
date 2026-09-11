import { pgTable, varchar, boolean, integer, uuid, timestamp, unique, date } from "drizzle-orm/pg-core";
import { id, createdAt, updatedAt } from "./common";

export const DUES_MEMBER_TYPES = ["scout", "leader"] as const;
export type DuesMemberType = (typeof DUES_MEMBER_TYPES)[number];

export const DUES_STATUSES = ["unpaid", "paid", "overdue", "waived"] as const;
export type DuesStatus = (typeof DUES_STATUSES)[number];

/**
 * A dues year/period (e.g. "2025-2026"). One cycle is marked `isCurrent` at a
 * time — that's the cycle the UI's "Dues" page manages by default.
 *
 * Dues are a *tracker* (paid / not-yet-paid), kept intentionally separate from
 * the money ledger. Marking a member paid does NOT create a transaction.
 */
export const duesCyclesTable = pgTable("dues_cycles", {
  id: id,
  label: varchar("label", { length: 64 }).notNull().unique(),
  // Per-type rates (cents) so scout/leader can differ.
  scoutAmountCents: integer("scout_amount_cents").notNull().default(0),
  leaderAmountCents: integer("leader_amount_cents").notNull().default(0),
  isCurrent: boolean("is_current").notNull().default(false),
  bankAccountId: uuid("bank_account_id"),
  createdAt: createdAt,
});

export type DuesCycle = typeof duesCyclesTable.$inferSelect;
export type NewDuesCycle = typeof duesCyclesTable.$inferInsert;

/**
 * One dues obligation for a member (scout or leader) within a cycle.
 *   memberType "scout"   -> memberId = scouts.id
 *   memberType "leader"  -> memberId = leaders.id
 *
 * Status is computed from isPaid, isWaived, and dueDate:
 *   - isWaived = true  → "waived"
 *   - isPaid = true    → "paid"
 *   - dueDate < now()  → "overdue"
 *   - otherwise        → "unpaid"
 */
export const duesTable = pgTable(
  "dues",
  {
    id: id,
    cycleId: uuid("cycle_id")
      .notNull()
      .references(() => duesCyclesTable.id, { onDelete: "cascade" }),
    memberType: varchar("member_type", { length: 16 })
      .notNull()
      .$type<DuesMemberType>(),
    memberId: uuid("member_id"),
    // The amount due (cents). 0 = "no amount set / not required".
    amountCents: integer("amount_cents").notNull().default(0),
    isPaid: boolean("is_paid").notNull().default(false),
    isWaived: boolean("is_waived").notNull().default(false),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    dueDate: date("due_date"),
    notes: varchar("notes", { length: 512 }),
    createdAt: createdAt,
    updatedAt: updatedAt,
  },
  (t) => [
    // One row per (cycle, memberType, member).
    unique("dues_cycle_member_unique").on(t.cycleId, t.memberType, t.memberId),
  ],
);

export type Dues = typeof duesTable.$inferSelect;
export type NewDues = typeof duesTable.$inferInsert;

/**
 * Audit trail for dues changes — marks, waivers, amount changes, and
 * payments linked to the main ledger. Each row is an immutable log entry.
 */
export const duesTransactionsTable = pgTable("dues_transactions", {
  id: id,
  duesId: uuid("dues_id")
    .notNull()
    .references(() => duesTable.id, { onDelete: "cascade" }),
  // What action was taken on this dues entry.
  action: varchar("action", { length: 32 }).notNull(),
  // Who performed the action (user id).
  userId: uuid("user_id"),
  // Snapshot of the dues state after the action.
  amountCents: integer("amount_cents").notNull(),
  isPaid: boolean("is_paid").notNull().default(false),
  isWaived: boolean("is_waived").notNull().default(false),
  // Reference to a transaction in the main ledger (if a payment was recorded).
  transactionId: uuid("transaction_id"),
  // Optional note explaining the change.
  note: varchar("note", { length: 512 }),
  createdAt: createdAt,
});

export type DuesTransaction = typeof duesTransactionsTable.$inferSelect;
export type NewDuesTransaction = typeof duesTransactionsTable.$inferInsert;
