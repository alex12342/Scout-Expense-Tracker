import { pgTable, varchar, text, date, integer, unique, uuid } from "drizzle-orm/pg-core";
import { id, createdAt, updatedAt } from "./common";
import { usersTable } from "./users";
import { scoutsTable } from "./scouts";

export const eventsTable = pgTable("events", {
  id: id,
  name: varchar("name", { length: 160 }).notNull(),
  eventDate: date("event_date", { mode: "string" }).notNull(),
  description: text("description"),
  // The troop's total cost for the event (the amount to split across scouts).
  totalCostCents: integer("total_cost_cents").notNull().default(0),
  createdBy: uuid("created_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt,
  updatedAt: updatedAt,
});

export type TroopEvent = typeof eventsTable.$inferSelect;
export type NewTroopEvent = typeof eventsTable.$inferInsert;

export const eventParticipantsTable = pgTable(
  "event_participants",
  {
    id: id,
    eventId: uuid("event_id")
      .notNull()
      .references(() => eventsTable.id, { onDelete: "cascade" }),
    scoutId: uuid("scout_id")
      .notNull()
      .references(() => scoutsTable.id, { onDelete: "cascade" }),
    amountAllocatedCents: integer("amount_allocated_cents")
      .notNull()
      .default(0),
    amountPaidCents: integer("amount_paid_cents").notNull().default(0),
    createdAt: createdAt,
  },
  (t) => [
    unique("event_participants_event_scout_unique").on(t.eventId, t.scoutId),
  ],
);

export type EventParticipant = typeof eventParticipantsTable.$inferSelect;
export type NewEventParticipant = typeof eventParticipantsTable.$inferInsert;
