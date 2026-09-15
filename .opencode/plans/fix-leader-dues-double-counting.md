# Fix: Leader Detail Page - Dues Card Negative Remaining Balance

## Bugs Found

### Bug 1: Double-counting when applying deposit to dues (FIXED in dues.ts:519-527)

The `POST /dues/apply-deposit` endpoint was creating a `scout_deposit` transaction for the full amount even when all dues were paid. Fixed to only create `scout_deposit` when `balance > 0`.

### Bug 2: Dues card shows negative remaining balance (leaders.ts:65-90)

**Root cause:** `assessedCents` is calculated from `dues_assessed` **ledger transactions**, but these may not exist for a leader if:
- Dues entries were created without going through the cycle generation flow
- The cycle was generated before the leader was added
- The `dues_assessed` transactions were deleted or never created

When `dues_assessed` transactions are missing:
- `assessedCents` = 0
- `paidCents` = sum of `dues_payment` (e.g., 3000)
- `remaining` = 0 - 3000 = **-3000** (negative!)

**The `dues` table is the source of truth** per the schema comments: *"Dues are a tracker (paid / not-yet-paid), kept intentionally separate from the money ledger."*

**Fix:** Calculate `assessedCents` from the `dues` table instead of `dues_assessed` transactions.

### Bug 3: Same issue in scout detail page (scouts.ts:84-110)

The scout detail page has the same bug — `assessedCents` calculated from `dues_assessed` transactions which may not exist.

## Changes Required

### 1. `artifacts/api-server/src/routes/leaders.ts`

**Add `duesTable` import** (line 3-8):
```typescript
import {
  db,
  leadersTable,
  transactionsTable,
  eventParticipantsTable,
  duesTable,  // ADD
} from "@scout-expense-tracker/db";
```

**Replace the `assessedCents` calculation** (line 65-75):

**Before:**
```typescript
  // Dues breakdown from ledger transactions.
  const [assessedRow] = await db
    .select({
      total: sql<number>`coalesce(sum(amount_cents), 0)`,
    })
    .from(transactionsTable as any)
    .where(
      and(
        eq(transactionsTable.type as any, "dues_assessed"),
        eq((transactionsTable as any).leaderId, leader.id),
      ),
    );

  const [paidRow] = await db
    .select({
      total: sql<number>`coalesce(sum(amount_cents), 0)`,
    })
    .from(transactionsTable as any)
    .where(
      and(
        eq(transactionsTable.type as any, "dues_payment"),
        eq((transactionsTable as any).leaderId, leader.id),
      ),
    );

  const assessedCents = Math.abs(Number(assessedRow?.total ?? 0));
  const paidCents = Number(paidRow?.total ?? 0);
```

**After:**
```typescript
  // Dues breakdown — dues table is the source of truth for what's owed.
  const [assessedRow] = await db
    .select({
      total: sql<number>`coalesce(sum(${duesTable.amountCents}), 0)`,
    })
    .from(duesTable)
    .where(eq(duesTable.memberId, leader.id));

  const [paidRow] = await db
    .select({
      total: sql<number>`coalesce(sum(amount_cents), 0)`,
    })
    .from(transactionsTable as any)
    .where(
      and(
        eq(transactionsTable.type as any, "dues_payment"),
        eq((transactionsTable as any).leaderId, leader.id),
      ),
    );

  const assessedCents = Number(assessedRow?.total ?? 0);
  const paidCents = Number(paidRow?.total ?? 0);
  const remainingCents = Math.max(0, assessedCents - paidCents);
```

**Update the response** (line 91-98):
```typescript
  res.json({
    ...leader,
    balanceCents,
    duesBreakdown: {
      assessedCents,
      paidCents,
      remainingCents,
    },
  });
```

### 2. `artifacts/api-server/src/routes/scouts.ts`

Same fix as leaders.ts — add `duesTable` import and calculate `assessedCents` from the `dues` table.

### 3. `artifacts/web/src/pages/LeaderDetailPage.tsx`

**Update dues card display** to show remaining from `duesBreakdown.remainingCents`:

**Before:**
```typescript
const totalAssessed = leader?.duesBreakdown?.assessedCents ?? 0;
const totalPaid = leader?.duesBreakdown?.paidCents ?? 0;
const totalRemaining = totalAssessed - totalPaid;
```

**After:**
```typescript
const totalAssessed = leader?.duesBreakdown?.assessedCents ?? 0;
const totalPaid = leader?.duesBreakdown?.paidCents ?? 0;
const totalRemaining = leader?.duesBreakdown?.remainingCents ?? Math.max(0, totalAssessed - totalPaid);
```

**Update the dues card condition** to show when there are dues entries (not just transactions):
```typescript
{leader && (totalAssessed > 0 || totalPaid > 0 || totalRemaining > 0) && (
```

### 4. `artifacts/web/src/pages/ScoutDetailPage.tsx`

Same fix as LeaderDetailPage.tsx for consistency.

## Verification

1. Create a leader with dues entries
2. Record a deposit with "Apply to outstanding dues" checked
3. Verify:
   - Dues card shows: assessed: X, paid: X, remaining: 0
   - Balance shows: $20 (the excess deposit)
   - Ledger shows `dues_payment` of 30 + `scout_deposit` of 20
4. Test with deposit smaller than dues:
   - Dues card shows: assessed: X, paid: Y, remaining: X-Y
   - Balance shows: negative (scout still owes)
5. Test with no `dues_assessed` transactions:
   - Dues card should still show correct values from the `dues` table
