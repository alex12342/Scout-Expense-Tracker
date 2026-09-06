import { pgTable, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { id, createdAt, updatedAt } from "./common";

export const usersTable = pgTable("users", {
  id: id,
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: varchar("display_name", { length: 128 }).notNull(),
  role: varchar("role", { length: 16 })
    .notNull()
    .default("admin")
    .$type<"admin" | "leader">(),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt,
  updatedAt: updatedAt,
});

export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
