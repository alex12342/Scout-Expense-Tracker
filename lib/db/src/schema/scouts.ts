import { pgTable, varchar, boolean } from "drizzle-orm/pg-core";
import { id, createdAt, updatedAt } from "./common";

export const scoutsTable = pgTable("scouts", {
  id: id,
  name: varchar("name", { length: 128 }).notNull(),
  // BSA number (the 6-7 digit number on the membership card). Optional + unique.
  bsaNumber: varchar("bsa_number", { length: 16 }).unique(),
  rank: varchar("rank", { length: 64 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt,
  updatedAt: updatedAt,
});

export type Scout = typeof scoutsTable.$inferSelect;
export type NewScout = typeof scoutsTable.$inferInsert;
