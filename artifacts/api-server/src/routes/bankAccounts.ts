import { Router } from "express";
import { z } from "zod";
import {
  db,
  bankAccountsTable,
  transactionsTable,
} from "@scout-expense-tracker/db";
import { eq, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { getBankBalance, listLedger } from "../lib/queries";
import { parseMoneyToCents } from "../lib/money";

const router = Router();

const accountSchema = z.object({
  name: z.string().trim().min(1).max(128),
  accountType: z.enum(["checking", "savings"]).default("checking"),
  last4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Last 4 digits")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

const createAccountSchema = accountSchema.extend({
  // Optional opening balance, entered in dollars (e.g. "2000" or 1500.50).
  openingBalance: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === "") return undefined;
      const cents = parseMoneyToCents(v);
      if (cents === null) throw new Error("Opening balance must be a valid dollar amount");
      return cents;
    }),
});

const updateAccountSchema = accountSchema.partial();

// GET / — all accounts with computed balances.
router.get("/", requireAuth, async (_req, res) => {
  const accounts = await db
    .select()
    .from(bankAccountsTable)
    .orderBy(bankAccountsTable.name);
  const balances = await Promise.all(
    accounts.map((a) => getBankBalance(a.id)),
  );
  res.json(accounts.map((a, i) => ({ ...a, balanceCents: balances[i] })));
});

// POST / — create account (with optional opening balance transaction).
router.post("/", requireAuth, async (req, res) => {
  const parsed = createAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid account", issues: parsed.error.flatten() });
    return;
  }
  const { openingBalance, ...fields } = parsed.data;

  const result = await db.transaction(async (tx) => {
    const [account] = await tx
      .insert(bankAccountsTable)
      .values(fields)
      .returning();
    if (openingBalance !== undefined && openingBalance !== 0) {
      await tx.insert(transactionsTable).values({
        occurredAt: new Date(),
        type: "opening_balance",
        amountCents: openingBalance,
        bankAccountId: account.id,
        description: "Opening balance",
        createdBy: req.userId,
      });
    }
    return account;
  });

  res.status(201).json(result);
});

// GET /:id — account detail + balance.
router.get("/:id", requireAuth, async (req, res) => {
  const [account] = await db
    .select()
    .from(bankAccountsTable)
    .where(eq(bankAccountsTable.id, String(req.params.id)))
    .limit(1);
  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  const balanceCents = await getBankBalance(account.id);
  res.json({ ...account, balanceCents });
});

// GET /:id/transactions — chronological activity for the account.
router.get("/:id/transactions", requireAuth, async (req, res) => {
  const [account] = await db
    .select({ id: bankAccountsTable.id })
    .from(bankAccountsTable)
    .where(eq(bankAccountsTable.id, String(req.params.id)))
    .limit(1);
  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  const balanceCents = await getBankBalance(account.id);
  const entries = await listLedger({ bankAccountId: account.id });
  res.json({ balanceCents, entries });
});

// PATCH /:id — update account.
router.patch("/:id", requireAuth, async (req, res) => {
  const parsed = updateAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid account", issues: parsed.error.flatten() });
    return;
  }
  const [account] = await db
    .update(bankAccountsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(bankAccountsTable.id, String(req.params.id)))
    .returning();
  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  res.json(account);
});

// DELETE /:id — blocked while activity exists.
router.delete("/:id", requireAuth, async (req, res) => {
  const [account] = await db
    .select({ id: bankAccountsTable.id })
    .from(bankAccountsTable)
    .where(eq(bankAccountsTable.id, String(req.params.id)))
    .limit(1);
  if (!account) {
    res.status(404).json({ error: "Account not found" });
    return;
  }

  const [{ n: txCount }] = await db
    .select({ n: count() })
    .from(transactionsTable)
    .where(eq(transactionsTable.bankAccountId, account.id));
  if (txCount > 0) {
    res.status(409).json({
      error: "This account has transactions. Record a closing adjustment instead of deleting.",
    });
    return;
  }

  await db.delete(bankAccountsTable).where(eq(bankAccountsTable.id, account.id));
  res.json({ ok: true });
});

export default router;
