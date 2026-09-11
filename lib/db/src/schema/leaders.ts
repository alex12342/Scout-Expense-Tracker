import { pgTable, varchar, boolean, integer } from "drizzle-orm/pg-core";
import { id, createdAt, updatedAt } from "./common";

/**
 * Troop leadership (adult volunteers) — a full parallel of scouts: they have a
 * roster, can be event cost-split participants, carry a balance, and pay dues.
 */
export const leadersTable = pgTable("leaders", {
  id: id,
  // Legacy combined name. The API keeps this in sync as `firstName + " " + lastName`.
  name: varchar("name", { length: 128 }).notNull().default(""),
  firstName: varchar("first_name", { length: 128 }).notNull().default(""),
  lastName: varchar("last_name", { length: 128 }).notNull().default(""),
  // Role in the troop (e.g. "Scoutmaster", "Committee Chair").
  position: varchar("position", { length: 64 }),
  // Optional override for dues amount (cents).
  duesAmountOverrideCents: integer("dues_amount_override_cents"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt,
  updatedAt: updatedAt,
});

export type Leader = typeof leadersTable.$inferSelect;
export type NewLeader = typeof leadersTable.$inferInsert;
