import { pgTable, varchar } from "drizzle-orm/pg-core";
import { id, createdAt, updatedAt } from "./common";

export const bankAccountsTable = pgTable("bank_accounts", {
  id: id,
  name: varchar("name", { length: 128 }).notNull(),
  accountType: varchar("account_type", { length: 16 })
    .notNull()
    .default("checking")
    .$type<"checking" | "savings">(),
  // Optional last-4 for display (we never store the full number).
  last4: varchar("last4", { length: 4 }),
  createdAt: createdAt,
  updatedAt: updatedAt,
});

export type BankAccount = typeof bankAccountsTable.$inferSelect;
export type NewBankAccount = typeof bankAccountsTable.$inferInsert;
