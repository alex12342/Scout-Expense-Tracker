import { sql } from "drizzle-orm";
import { uuid, timestamp, integer } from "drizzle-orm/pg-core";

/**
 * Primary key: client-friendly UUID (v4) as text.
 */
export const id = uuid("id").notNull().default(sql`(gen_random_uuid())`).primaryKey();

/**
 * Standard audit timestamps (UTC).
 */
export const createdAt = timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow();
export const updatedAt = timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow();

/**
 * Money is stored as integer cents to avoid any floating-point drift.
 * The API exposes `*_cents` fields; the UI formats cents -> dollars.
 */
export const moneyCents = (col = "amount_cents") =>
  integer(col).notNull().default(0);
