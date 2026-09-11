import { pgTable, varchar, boolean, integer } from "drizzle-orm/pg-core";
import { id, createdAt, updatedAt } from "./common";

export const scoutsTable = pgTable("scouts", {
  id: id,
  // Legacy combined name. The API keeps this in sync as `firstName + " " + lastName`.
  // Retained (never dropped) for backward compatibility and convenient CSV export.
  name: varchar("name", { length: 128 }).notNull(),
  firstName: varchar("first_name", { length: 128 }).notNull().default(""),
  lastName: varchar("last_name", { length: 128 }).notNull().default(""),
  // BSA number (the 6-7 digit number on the membership card). Optional + unique.
  bsaNumber: varchar("bsa_number", { length: 16 }).unique(),
  rank: varchar("rank", { length: 64 }),
  age: integer("age"),
  // Optional override for dues amount (cents) — if null, uses the cycle default.
  duesAmountOverrideCents: integer("dues_amount_override_cents"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt,
  updatedAt: updatedAt,
});

export type Scout = typeof scoutsTable.$inferSelect;
export type NewScout = typeof scoutsTable.$inferInsert;
