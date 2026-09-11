import {
  pgTable,
  varchar,
  text,
  date,
  integer,
  unique,
  uuid,
  jsonb,
  check,
  uniqueIndex,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, createdAt, updatedAt } from "./common";
import { usersTable } from "./users";
import { scoutsTable } from "./scouts";
import { leadersTable } from "./leaders";

/** An optional, user-defined key/value field attached to an event. */
export const EVENT_COST_CHANGE_ACTIONS = ["add_line", "remove_line", "update_line", "update_total"] as const;
export type EventCostChangeAction = (typeof EVENT_COST_CHANGE_ACTIONS)[number];

export const EVENT_LINE_ITEM_PARTICIPANT_TYPES = ["scout", "leader", "everyone"] as const;
export type EventLineItemParticipantType = (typeof EVENT_LINE_ITEM_PARTICIPANT_TYPES)[number];

export interface EventField {
  key: string;
  value: string;
}

export interface NewEventLineItem {
  name: string;
  amountCents: number;
  participantTypes?: EventLineItemParticipantType[];
}

export const eventsTable = pgTable("events", {
  id: id,
  name: varchar("name", { length: 160 }).notNull(),
  eventDate: date("event_date", { mode: "string" }).notNull(),
  description: text("description"),
  // The troop's total cost for the event (the amount to split across participants).
  totalCostCents: integer("total_cost_cents").notNull().default(0),
  // Optional user-defined key/value fields (e.g. "Location", "Counselor on duty").
  fields: jsonb("fields").$type<EventField[]>().default([]),
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
    // A participant is exactly one scout OR one leader (enforced by the CHECK
    // constraint below). Exactly one of these is non-null.
    scoutId: uuid("scout_id").references(() => scoutsTable.id, {
      onDelete: "cascade",
    }),
    leaderId: uuid("leader_id").references(() => leadersTable.id, {
      onDelete: "cascade",
    }),
    amountAllocatedCents: integer("amount_allocated_cents")
      .notNull()
      .default(0),
    estimatedAllocatedCents: integer("estimated_allocated_cents")
      .notNull()
      .default(0),
    amountPaidCents: integer("amount_paid_cents").notNull().default(0),
    createdAt: createdAt,
  },
  (t) => [
    // XOR: exactly one of (scoutId, leaderId) must be set.
    check(
      "event_participants_member_check",
      sql`(${t.scoutId} IS NOT NULL) <> (${t.leaderId} IS NOT NULL)`,
    ),
    // One row per (event, scout) — unchanged from before.
    unique("event_participants_event_scout_unique").on(t.eventId, t.scoutId),
    // One row per (event, leader) — partial index (leader rows have scoutId NULL).
    uniqueIndex("event_participants_event_leader_unique")
      .on(t.eventId, t.leaderId)
      .where(sql`${t.scoutId} IS NULL`),
  ],
);

export type EventParticipant = typeof eventParticipantsTable.$inferSelect;
export type NewEventParticipant = typeof eventParticipantsTable.$inferInsert;

/**
 * Line items that make up an event's cost (e.g., "Bus rental: $200", "Food: $150").
 * Each line item can target scouts, leaders, or everyone.
 */
export const eventLineItemsTable = pgTable("event_line_items", {
  id: id,
  eventId: uuid("event_id")
    .notNull()
    .references(() => eventsTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  amountCents: integer("amount_cents").notNull(),
  participantTypes: varchar("participant_types", { length: 32 })
    .notNull()
    .$type<EventLineItemParticipantType[]>()
    .default(["everyone"])
    .array(),
  isEstimated: boolean("is_estimated").notNull().default(true),
  createdAt: createdAt,
  updatedAt: updatedAt,
});

export type EventLineItem = typeof eventLineItemsTable.$inferSelect;

/**
 * Audit log of cost changes on events.
 */
export const eventCostChangesTable = pgTable("event_cost_changes", {
  id: id,
  eventId: uuid("event_id")
    .notNull()
    .references(() => eventsTable.id, { onDelete: "cascade" }),
  action: varchar("action", { length: 50 })
    .notNull()
    .$type<EventCostChangeAction>(),
  oldAmountCents: integer("old_amount_cents"),
  newAmountCents: integer("new_amount_cents"),
  userId: uuid("user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  note: text("note"),
  createdAt: createdAt,
});

export type EventCostChange = typeof eventCostChangesTable.$inferSelect;
export type NewEventCostChange = typeof eventCostChangesTable.$inferInsert;
