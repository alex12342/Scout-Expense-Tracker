import { Router } from "express";
import { z } from "zod";
import {
  db,
  eventsTable,
  eventParticipantsTable,
  scoutsTable,
  bankAccountsTable,
  transactionsTable,
} from "@scout-expense-tracker/db";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { evenSplitCents, parseMoneyToCents } from "../lib/money";

const router = Router();

// ── helpers ─────────────────────────────────────────────────────────────────

interface ParticipantIn {
  scoutId: string;
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
  const [agg, participants] =
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
            })
            .from(eventParticipantsTable)
            .where(inArray(eventParticipantsTable.eventId, eventIds)),
        ])
      : [[], []];

  const aggMap = new Map(agg.map((a) => [a.eventId, a]));
  const partMap = new Map<string, { scoutId: string }[]>();
  for (const p of participants) {
    const list = partMap.get(p.eventId) ?? [];
    list.push({ scoutId: p.scoutId });
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
        isPaid: allocated > 0 && paid >= allocated,
      };
    }),
  );
});

// ── POST / — create event + participants + allocation transactions ──────────

const participantSchema = z.object({
  scoutId: z.string().uuid(),
  amountAllocated: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === "") return undefined;
      const cents = parseMoneyToCents(v);
      if (cents === null || cents < 0) throw new Error("Invalid allocation");
      return cents;
    }),
});

const createEventSchema = z.object({
  name: z.string().trim().min(1).max(160),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  description: z.string().trim().max(2000).optional(),
  totalCost: z.union([z.string(), z.number()]),
  participants: z.array(participantSchema).min(1, "At least one participant"),
});

router.post("/", requireAuth, async (req, res) => {
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid event", issues: parsed.error.flatten() });
    return;
  }
  const { name, eventDate, description, participants } = parsed.data;
  const totalCostCents = parseMoneyToCents(parsed.data.totalCost);
  if (totalCostCents === null || totalCostCents <= 0) {
    res.status(400).json({ error: "Total cost must be a positive dollar amount" });
    return;
  }

  // Dedupe participants by scoutId.
  const seen = new Set<string>();
  const clean: { scoutId: string; explicit?: number }[] = [];
  for (const p of participants) {
    if (seen.has(p.scoutId)) continue;
    seen.add(p.scoutId);
    clean.push({ scoutId: p.scoutId, explicit: p.amountAllocated });
  }

  // Validate all scouts exist.
  const scoutIds = clean.map((p) => p.scoutId);
  const found = await db
    .select({ id: scoutsTable.id })
    .from(scoutsTable)
    .where(inArray(scoutsTable.id, scoutIds));
  if (found.length !== scoutIds.length) {
    res.status(400).json({ error: "One or more participants do not exist" });
    return;
  }

  // Resolve allocations: explicit overrides, or even split of total.
  const explicitSum = clean.reduce(
    (s, p) => s + (p.explicit ?? 0),
    0,
  );
  const hasExplicit = clean.some((p) => p.explicit !== undefined);

  let allocations: Record<string, number>;
  if (hasExplicit) {
    allocations = {};
    for (const p of clean) {
      if (p.explicit === undefined) {
        res.status(400).json({
          error: "Either set every participant's allocation or none (auto-split)",
        });
        return;
      }
      allocations[p.scoutId] = p.explicit;
    }
    if (explicitSum !== totalCostCents) {
      res.status(400).json({
        error:
          `Allocations must total exactly the event cost ` +
          `(currently off by ${Math.abs(explicitSum - totalCostCents) / 100} dollars)`,
      });
      return;
    }
  } else {
    const parts = evenSplitCents(totalCostCents, clean.length);
    allocations = {};
    clean.forEach((p, i) => (allocations[p.scoutId] = parts[i]));
  }

  // Write event + participants + allocation transactions atomically.
  const result = await db.transaction(async (tx) => {
    const [event] = await tx
      .insert(eventsTable)
      .values({
        name,
        eventDate,
        description: description ?? null,
        totalCostCents,
        createdBy: req.userId,
      })
      .returning();

    const insertedParts = (
      await Promise.all(
        clean.map((p) =>
          tx
            .insert(eventParticipantsTable)
            .values({
              eventId: event.id,
              scoutId: p.scoutId,
              amountAllocatedCents: allocations[p.scoutId],
              amountPaidCents: 0,
            })
            .returning(),
        ),
      )
    ).flat();

    await tx.insert(transactionsTable).values(
      insertedParts.map((part) => ({
        occurredAt: new Date(),
        type: "event_allocation" as const,
        amountCents: -allocations[part.scoutId],
        scoutId: part.scoutId,
        eventId: event.id,
        eventParticipantId: part.id,
        description: `Allocated share — ${name}`,
        createdBy: req.userId,
      })),
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
    })
    .from(eventParticipantsTable)
    .leftJoin(
      scoutsTable,
      eq(eventParticipantsTable.scoutId, scoutsTable.id),
    )
    .where(eq(eventParticipantsTable.eventId, id))
    .orderBy(scoutsTable.name);

  return {
    ...event,
    participants: participants.map((p) => ({
      ...p.part,
      scoutName: p.scoutName,
      outstandingCents: p.part.amountAllocatedCents - p.part.amountPaidCents,
      status: paymentStatus(
        p.part.amountPaidCents,
        p.part.amountAllocatedCents,
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

// ── POST /:id/payments — record a participant payment ───────────────────────

const paymentSchema = z.object({
  scoutId: z.string().uuid(),
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
  const { scoutId, bankAccountId, description, occurredAt } = parsed.data;
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
  const participant = event.participants.find((p) => p.scoutId === scoutId);
  if (!participant) {
    res.status(400).json({ error: "Scout is not a participant in this event" });
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
          eq(eventParticipantsTable.scoutId, scoutId),
        ),
      );

    const [payment] = await tx
      .insert(transactionsTable)
      .values({
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
        type: "event_payment",
        amountCents,
        scoutId,
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
  const { scoutId, bankAccountId, description, occurredAt } = parsed.data;
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
  const participant = event.participants.find((p) => p.scoutId === scoutId);
  if (!participant) {
    res.status(400).json({ error: "Scout is not a participant in this event" });
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
          eq(eventParticipantsTable.scoutId, scoutId),
        ),
      );

    const [refund] = await tx
      .insert(transactionsTable)
      .values({
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
        type: "event_refund",
        amountCents: -amountCents,
        scoutId,
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
