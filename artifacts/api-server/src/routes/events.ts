import { Router } from "express";
import { z } from "zod";
import {
  db,
  eventsTable,
  eventParticipantsTable,
  scoutsTable,
  leadersTable,
  bankAccountsTable,
  transactionsTable,
  eventLineItemsTable,
  eventCostChangesTable,
} from "@scout-expense-tracker/db";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { evenSplitCents, parseMoneyToCents } from "../lib/money";
import { EVENT_LINE_ITEM_PARTICIPANT_TYPES } from "@scout-expense-tracker/db";

const router = Router();

// ── helpers ─────────────────────────────────────────────────────────────────

interface ParticipantIn {
  scoutId?: string;
  leaderId?: string;
  amountAllocatedCents?: number; // optional override
}

function paymentStatus(paid: number, allocated: number): "unpaid" | "partial" | "paid" {
  if (paid <= 0) return "unpaid";
  if (paid >= allocated) return "paid";
  return "partial";
}

// ── GET / — list events with aggregates ─────────────────────────────────────

router.get("/", requireAuth, async (_req, res) => {
  const events = await db
    .select()
    .from(eventsTable)
    .orderBy(desc(eventsTable.eventDate));

  const eventIds = events.map((e) => e.id);
  const [agg, participants, lineItems] =
    eventIds.length > 0
      ? await Promise.all([
          db
            .select({
              eventId: eventParticipantsTable.eventId,
              allocated: sql<number>`coalesce(sum(${eventParticipantsTable.amountAllocatedCents}),0)`,
              paid: sql<number>`coalesce(sum(${eventParticipantsTable.amountPaidCents}),0)`,
              n: sql<number>`count(*)`,
            })
            .from(eventParticipantsTable)
            .where(inArray(eventParticipantsTable.eventId, eventIds))
            .groupBy(eventParticipantsTable.eventId),
          db
            .select({
              eventId: eventParticipantsTable.eventId,
              scoutId: eventParticipantsTable.scoutId,
              leaderId: eventParticipantsTable.leaderId,
            })
            .from(eventParticipantsTable)
            .where(inArray(eventParticipantsTable.eventId, eventIds)),
          db
            .select({
              eventId: eventLineItemsTable.eventId,
              total: sql<number>`coalesce(sum(${eventLineItemsTable.amountCents}),0)`,
            })
            .from(eventLineItemsTable)
            .where(inArray(eventLineItemsTable.eventId, eventIds))
            .groupBy(eventLineItemsTable.eventId),
        ])
      : [[], [], []];

  const aggMap = new Map(agg.map((a) => [a.eventId, a]));
  const partMap = new Map<string, { scoutId: string | null; leaderId: string | null }[]>();
  const lineItemMap = new Map(lineItems.map((li) => [li.eventId, li.total]));
  for (const p of participants) {
    const list = partMap.get(p.eventId) ?? [];
    list.push({ scoutId: p.scoutId, leaderId: p.leaderId });
    partMap.set(p.eventId, list);
  }

  res.json(
    events.map((e) => {
      const a = aggMap.get(e.id);
      const allocated = Number(a?.allocated ?? 0);
      const paid = Number(a?.paid ?? 0);
      return {
        ...e,
        totalAllocatedCents: allocated,
        totalPaidCents: paid,
        outstandingCents: allocated - paid,
        participantCount: Number(a?.n ?? 0),
        estimatedTotalCents: Number(lineItemMap.get(e.id) ?? 0),
      };
    }),
  );
});

// ── POST / — create event + participants + allocation transactions ──────────

const participantSchema = z.object({
  scoutId: z.string().uuid().optional(),
  leaderId: z.string().uuid().optional(),
  amountAllocatedCents: z.number().int().min(0).optional(),
}).refine((v) => (v.scoutId ? 1 : 0) + (v.leaderId ? 1 : 0) === 1, {
  message: "Exactly one of scoutId or leaderId is required",
});

const lineItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  amountCents: z.number().int().min(0),
  participantTypes: z.enum(EVENT_LINE_ITEM_PARTICIPANT_TYPES).array().optional(),
});

const createEventSchema = z.object({
  name: z.string().trim().min(1).max(160),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  description: z.string().trim().max(2000).optional(),
  lineItems: z.array(lineItemSchema).min(1, "At least one line item is required"),
  participants: z.array(participantSchema).min(1, "At least one participant"),
});

router.post("/", requireAuth, async (req, res) => {
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid event", issues: parsed.error.flatten() });
    return;
  }
  const { name, eventDate, description, lineItems, participants } = parsed.data;

  // Dedupe participants by their ID (scout or leader).
  const seen = new Set<string>();
  const clean: ParticipantIn[] = [];
  for (const p of participants) {
    const key = p.scoutId ?? p.leaderId ?? "";
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(p);
  }

  // Validate all participants exist.
  const scoutIds = clean.map((p) => p.scoutId).filter(Boolean) as string[];
  const leaderIds = clean.map((p) => p.leaderId).filter(Boolean) as string[];
  if (scoutIds.length) {
    const found = await db
      .select({ id: scoutsTable.id })
      .from(scoutsTable)
      .where(inArray(scoutsTable.id, scoutIds));
    if (found.length !== scoutIds.length) {
      res.status(400).json({ error: "One or more participants do not exist" });
      return;
    }
  }
  if (leaderIds.length) {
    const found = await db
      .select({ id: leadersTable.id })
      .from(leadersTable)
      .where(inArray(leadersTable.id, leaderIds));
    if (found.length !== leaderIds.length) {
      res.status(400).json({ error: "One or more participants do not exist" });
      return;
    }
  }

  // Calculate estimated total from line items.
  const estimatedTotalCents = lineItems.reduce((s, item) => s + item.amountCents, 0);

  // Calculate per-participant estimated allocations respecting participantTypes and overrides.
  const scoutParticipants = clean.filter((p) => p.scoutId);
  const leaderParticipants = clean.filter((p) => p.leaderId);

  // For each line item, determine which participants are responsible.
  const lineItemLoads: Array<{
    amountCents: number;
    participants: ParticipantIn[];
  }> = lineItems.map((item) => {
    const types = item.participantTypes ?? ["everyone"];
    const applicable = clean.filter((p) => {
      if (types.includes("everyone")) return true;
      if (p.scoutId && types.includes("scout")) return true;
      if (p.leaderId && types.includes("leader")) return true;
      return false;
    });
    return { amountCents: item.amountCents, participants: applicable };
  });

  // Split each line item across applicable participants.
  const participantEstimated: Record<string, number> = {};
  for (const p of clean) {
    participantEstimated[p.scoutId ?? p.leaderId ?? ""] = 0;
  }

  for (const load of lineItemLoads) {
    if (load.participants.length === 0) continue;
    const hasExplicit = load.participants.some((p) => p.amountAllocatedCents !== undefined);
    if (hasExplicit) {
      // Use explicit overrides.
      for (const p of load.participants) {
        const key = p.scoutId ?? p.leaderId ?? "";
        participantEstimated[key] += p.amountAllocatedCents ?? 0;
      }
    } else {
      // Even split among applicable participants.
      const parts = evenSplitCents(load.amountCents, load.participants.length);
      load.participants.forEach((p, i) => {
        const key = p.scoutId ?? p.leaderId ?? "";
        participantEstimated[key] += parts[i];
      });
    }
  }

  // Write event + line items + participants + allocation transactions atomically.
  const result = await db.transaction(async (tx) => {
    const [event] = await tx
      .insert(eventsTable)
      .values({
        name,
        eventDate,
        description: description ?? null,
        totalCostCents: 0, // Will be updated via line items.
        createdBy: req.userId,
        fields: [],
      })
      .returning();

    // Insert line items.
    await tx.insert(eventLineItemsTable).values(
      lineItems.map((item) => ({
        eventId: event.id,
        name: item.name,
        amountCents: item.amountCents,
        participantTypes: item.participantTypes ?? ["everyone"],
      })),
    );

    const insertedParts = (
      await Promise.all(
        clean.map((p) =>
          tx
            .insert(eventParticipantsTable)
            .values({
              eventId: event.id,
              scoutId: p.scoutId ?? null,
              leaderId: p.leaderId ?? null,
              amountAllocatedCents: participantEstimated[p.scoutId ?? p.leaderId ?? ""] ?? 0,
              estimatedAllocatedCents: participantEstimated[p.scoutId ?? p.leaderId ?? ""] ?? 0,
              amountPaidCents: 0,
            })
            .returning(),
        ),
      )
    ).flat();

    await tx.insert(transactionsTable).values(
      insertedParts.map((part) => {
        const key = part.scoutId ?? part.leaderId ?? "";
        return {
          occurredAt: new Date(),
          type: "event_allocation" as const,
          amountCents: -(participantEstimated[key] ?? 0),
          scoutId: part.scoutId,
          leaderId: part.leaderId,
          eventId: event.id,
          eventParticipantId: part.id,
          description: `Estimated share — ${name}`,
          createdBy: req.userId,
        };
      }),
    );

    return { event, participants: insertedParts };
  });

  res.status(201).json(result);
});

// ── GET /:id — event detail ─────────────────────────────────────────────────

async function loadEvent(id: string) {
  const [event] = await db
    .select()
    .from(eventsTable)
    .where(eq(eventsTable.id, id))
    .limit(1);
  if (!event) return null;
  const participants = await db
    .select({
      part: eventParticipantsTable,
      scoutName: scoutsTable.name,
      leaderName: leadersTable.name,
    })
    .from(eventParticipantsTable)
    .leftJoin(
      scoutsTable,
      eq(eventParticipantsTable.scoutId, scoutsTable.id),
    )
    .leftJoin(
      leadersTable,
      eq(eventParticipantsTable.leaderId, leadersTable.id),
    )
    .where(eq(eventParticipantsTable.eventId, id))
    .orderBy((t) => {
      // Put scouts first, then leaders (name sort within each group).
      return t.leaderName;
    });

  const lineItems = await db
    .select()
    .from(eventLineItemsTable)
    .where(eq(eventLineItemsTable.eventId, id));

  const costChanges = await db
    .select()
    .from(eventCostChangesTable)
    .where(eq(eventCostChangesTable.eventId, id))
    .orderBy(desc(eventCostChangesTable.createdAt));

  const estimatedTotal = participants.reduce(
    (s, p) => s + p.part.estimatedAllocatedCents,
    0,
  );

  return {
    ...event,
    lineItems,
    costChanges,
    estimatedTotalCents: estimatedTotal,
    participants: participants.map((p) => ({
      ...p.part,
      scoutName: p.scoutName,
      leaderName: p.leaderName,
      estimatedOutstandingCents: p.part.estimatedAllocatedCents - p.part.amountPaidCents,
      outstandingCents: p.part.amountAllocatedCents - p.part.amountPaidCents,
      status: paymentStatus(
        p.part.amountPaidCents,
        p.part.estimatedAllocatedCents,
      ),
    })),
  };
}

router.get("/:id", requireAuth, async (req, res) => {
  const event = await loadEvent(String(req.params.id));
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  const payments = await db
    .select({
      tx: transactionsTable,
      scoutName: scoutsTable.name,
      bankAccountName: bankAccountsTable.name,
    })
    .from(transactionsTable)
    .leftJoin(
      scoutsTable,
      eq(transactionsTable.scoutId, scoutsTable.id),
    )
    .leftJoin(
      bankAccountsTable,
      eq(transactionsTable.bankAccountId, bankAccountsTable.id),
    )
    .where(and(eq(transactionsTable.eventId, event.id)))
    .orderBy(desc(transactionsTable.occurredAt));

  res.json({
    ...event,
    totalPaidCents: event.participants.reduce(
      (s, p) => s + p.amountPaidCents,
      0,
    ),
    payments: payments
      .filter((r) => r.tx.type === "event_payment" || r.tx.type === "event_refund")
      .map((r) => ({ ...r.tx, scoutName: r.scoutName, bankAccountName: r.bankAccountName })),
  });
});

// ── PATCH /:id — update name/date/description ───────────────────────────────

const updateEventSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  fields: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .nullable()
    .optional(),
});

router.patch("/:id", requireAuth, async (req, res) => {
  const parsed = updateEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid event", issues: parsed.error.flatten() });
    return;
  }
  const [event] = await db
    .update(eventsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(eventsTable.id, String(req.params.id)))
    .returning();
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  res.json(await loadEvent(event.id));
});

// ── PATCH /:id/update-costs — update line items and recalculate allocations ─

const updateCostsSchema = z.object({
  lineItems: z.array(lineItemSchema).min(1, "At least one line item is required"),
});

router.patch("/:id/update-costs", requireAuth, async (req, res) => {
  const parsed = updateCostsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid cost update", issues: parsed.error.flatten() });
    return;
  }
  const { lineItems } = parsed.data;

  const event = await loadEvent(String(req.params.id));
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const estimatedTotalCents = lineItems.reduce((s, item) => s + item.amountCents, 0);

  // Calculate new per-participant allocations.
  const clean = event.participants.map((p) => {
    const participantSchema = z.object({
      scoutId: z.string().uuid().optional(),
      leaderId: z.string().uuid().optional(),
      amountAllocatedCents: z.number().int().min(0).optional(),
    });
    const participantData = participantSchema.parse({
      scoutId: p.scoutId ?? undefined,
      leaderId: p.leaderId ?? undefined,
    });
    return participantData;
  });

  const scoutParticipants = clean.filter((p) => p.scoutId);
  const leaderParticipants = clean.filter((p) => p.leaderId);

  const lineItemLoads: Array<{
    amountCents: number;
    participants: typeof clean;
  }> = lineItems.map((item) => {
    const types = item.participantTypes ?? ["everyone"];
    const applicable = clean.filter((p) => {
      if (types.includes("everyone")) return true;
      if (p.scoutId && types.includes("scout")) return true;
      if (p.leaderId && types.includes("leader")) return true;
      return false;
    });
    return { amountCents: item.amountCents, participants: applicable };
  });

  const participantEstimated: Record<string, number> = {};
  for (const p of clean) {
    participantEstimated[p.scoutId ?? p.leaderId ?? ""] = 0;
  }

  for (const load of lineItemLoads) {
    if (load.participants.length === 0) continue;
    const hasExplicit = load.participants.some((p) => p.amountAllocatedCents !== undefined);
    if (hasExplicit) {
      for (const p of load.participants) {
        const key = p.scoutId ?? p.leaderId ?? "";
        participantEstimated[key] += p.amountAllocatedCents ?? 0;
      }
    } else {
      const parts = evenSplitCents(load.amountCents, load.participants.length);
      load.participants.forEach((p, i) => {
        const key = p.scoutId ?? p.leaderId ?? "";
        participantEstimated[key] += parts[i];
      });
    }
  }

  // Log cost changes.
  await db.transaction(async (tx) => {
    // Update line items.
    await tx
      .delete(eventLineItemsTable)
      .where(eq(eventLineItemsTable.eventId, event.id));

    await tx.insert(eventLineItemsTable).values(
      lineItems.map((item) => ({
        eventId: event.id,
        name: item.name,
        amountCents: item.amountCents,
        participantTypes: item.participantTypes ?? ["everyone"],
      })),
    );

    // Update participant allocations and create adjustment transactions.
    for (const participant of event.participants) {
      const key = participant.scoutId ?? participant.leaderId ?? "";
      const newEstimated = participantEstimated[key] ?? 0;
      const oldEstimated = participant.estimatedAllocatedCents;
      const diff = newEstimated - oldEstimated;

      if (diff !== 0) {
        await tx
          .update(eventParticipantsTable)
          .set({ estimatedAllocatedCents: newEstimated })
          .where(eq(eventParticipantsTable.id, participant.id));

        await tx.insert(transactionsTable).values({
          occurredAt: new Date(),
          type: "event_allocation" as const,
          amountCents: -diff,
          scoutId: participant.scoutId,
          leaderId: participant.leaderId,
          eventId: event.id,
          eventParticipantId: participant.id,
          description: `Cost adjustment — ${event.name}`,
          createdBy: req.userId,
        });
      } else {
        await tx
          .update(eventParticipantsTable)
          .set({ estimatedAllocatedCents: newEstimated })
          .where(eq(eventParticipantsTable.id, participant.id));
      }
    }

    // Log the update.
    await tx.insert(eventCostChangesTable).values({
      eventId: event.id,
      action: "update_total",
      oldAmountCents: event.totalCostCents,
      newAmountCents: estimatedTotalCents,
      userId: req.userId,
      note: "Updated event costs",
      createdAt: new Date(),
    });
  });

  res.json(await loadEvent(event.id));
});

// ── POST /:id/payments — record a participant payment ───────────────────────

const paymentSchema = z.object({
  scoutId: z.string().uuid().optional(),
  leaderId: z.string().uuid().optional(),
  amount: z.union([z.string(), z.number()]),
  bankAccountId: z.string().uuid().optional(),
  description: z.string().trim().max(512).optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
});

router.post("/:id/payments", requireAuth, async (req, res) => {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payment", issues: parsed.error.flatten() });
    return;
  }
  const { scoutId, leaderId, bankAccountId, description, occurredAt } = parsed.data;
  const amountCents = parseMoneyToCents(parsed.data.amount);
  if (amountCents === null || amountCents <= 0) {
    res.status(400).json({ error: "Payment amount must be positive" });
    return;
  }

  const event = await loadEvent(String(req.params.id));
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  const participant = event.participants.find(
    (p) => p.scoutId === scoutId || p.leaderId === leaderId,
  );
  if (!participant) {
    res.status(400).json({ error: "Participant not found in this event" });
    return;
  }
  const outstanding = participant.amountAllocatedCents - participant.amountPaidCents;
  if (amountCents > outstanding) {
    res.status(400).json({
      error: `Payment exceeds outstanding balance (${outstanding / 100} dollars)`,
    });
    return;
  }

  if (bankAccountId) {
    const [acct] = await db
      .select({ id: bankAccountsTable.id })
      .from(bankAccountsTable)
      .where(eq(bankAccountsTable.id, bankAccountId))
      .limit(1);
    if (!acct) {
      res.status(400).json({ error: "Unknown bank account" });
      return;
    }
  }

  const result = await db.transaction(async (tx) => {
    await tx
      .update(eventParticipantsTable)
      .set({
        amountPaidCents: sql`${eventParticipantsTable.amountPaidCents} + ${amountCents}`,
      })
      .where(
        and(
          eq(eventParticipantsTable.eventId, event.id),
          ...(scoutId ? [eq(eventParticipantsTable.scoutId, scoutId)] : []),
          ...(leaderId ? [eq(eventParticipantsTable.leaderId, leaderId)] : []),
        ),
      );

    const [payment] = await tx
      .insert(transactionsTable)
      .values({
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
        type: "event_payment",
        amountCents,
        scoutId: scoutId ?? null,
        leaderId: leaderId ?? null,
        bankAccountId: bankAccountId ?? null,
        eventId: event.id,
        eventParticipantId: participant.id,
        description: description ?? `Payment toward ${event.name}`,
        createdBy: req.userId,
      })
      .returning();

    return payment;
  });

  res.status(201).json(result);
});

// ── POST /:id/refunds — reverse a payment (records a negative event_payment) ─

router.post("/:id/refunds", requireAuth, async (req, res) => {
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid refund", issues: parsed.error.flatten() });
    return;
  }
  const { scoutId, leaderId, bankAccountId, description, occurredAt } = parsed.data;
  const amountCents = parseMoneyToCents(parsed.data.amount);
  if (amountCents === null || amountCents <= 0) {
    res.status(400).json({ error: "Refund amount must be positive" });
    return;
  }

  const event = await loadEvent(String(req.params.id));
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  const participant = event.participants.find(
    (p) => p.scoutId === scoutId || p.leaderId === leaderId,
  );
  if (!participant) {
    res.status(400).json({ error: "Participant not found in this event" });
    return;
  }
  if (participant.amountPaidCents < amountCents) {
    res.status(400).json({ error: "Refund exceeds amount paid" });
    return;
  }

  if (bankAccountId) {
    const [acct] = await db
      .select({ id: bankAccountsTable.id })
      .from(bankAccountsTable)
      .where(eq(bankAccountsTable.id, bankAccountId))
      .limit(1);
    if (!acct) {
      res.status(400).json({ error: "Unknown bank account" });
      return;
    }
  }

  const result = await db.transaction(async (tx) => {
    await tx
      .update(eventParticipantsTable)
      .set({
        amountPaidCents: sql`${eventParticipantsTable.amountPaidCents} - ${amountCents}`,
      })
      .where(
        and(
          eq(eventParticipantsTable.eventId, event.id),
          ...(scoutId ? [eq(eventParticipantsTable.scoutId, scoutId)] : []),
          ...(leaderId ? [eq(eventParticipantsTable.leaderId, leaderId)] : []),
        ),
      );

    const [refund] = await tx
      .insert(transactionsTable)
      .values({
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
        type: "event_refund",
        amountCents: -amountCents,
        scoutId: scoutId ?? null,
        leaderId: leaderId ?? null,
        bankAccountId: bankAccountId ?? null,
        eventId: event.id,
        eventParticipantId: participant.id,
        description: description ?? `Refund for ${event.name}`,
        createdBy: req.userId,
      })
      .returning();

    return refund;
  });

  res.status(201).json(result);
});

// ── DELETE /:id — void event (blocked once payments recorded) ───────────────

router.delete("/:id", requireAuth, async (req, res) => {
  const event = await loadEvent(String(req.params.id));
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  const paidTotal = event.participants.reduce((s, p) => s + p.amountPaidCents, 0);
  if (paidTotal > 0) {
    res.status(409).json({
      error:
        "Payments have been recorded for this event. Refund them first, then delete.",
    });
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(transactionsTable)
      .where(
        and(
          eq(transactionsTable.eventId, event.id),
          inArray(transactionsTable.type, ["event_allocation"]),
        ),
      );
    await tx
      .delete(eventParticipantsTable)
      .where(eq(eventParticipantsTable.eventId, event.id));
    await tx.delete(eventsTable).where(eq(eventsTable.id, event.id));
  });

  res.json({ ok: true });
});

export default router;
