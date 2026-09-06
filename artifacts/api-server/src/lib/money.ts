/**
 * Money helpers. All amounts are integer CENTS (never floats) end-to-end to
 * avoid rounding drift. The UI formats cents -> dollars for display.
 */

export function formatMoney(cents: number, opts?: { sign?: boolean }): string {
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const body = `${dollars.toLocaleString("en-US")}.${String(rem).padStart(2, "0")}`;
  const prefix = cents < 0 ? "-" : opts?.sign ? "+" : "";
  return `${prefix}$${body}`;
}

/** Parse a user-entered dollar string ("12", "12.5", "1,234.56") -> cents. */
export function parseMoneyToCents(input: string | number): number | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    return Math.round(input * 100);
  }
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  const wholeAbs = Math.abs(parseInt(whole, 10));
  const fracCents = parseInt((frac + "00").slice(0, 2), 10);
  return sign * (wholeAbs * 100 + fracCents);
}

/** Round an integer division evenly across `n` parts, distributing remainder. */
export function evenSplitCents(totalCents: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(totalCents / n);
  let remainder = totalCents - base * n;
  const parts: number[] = [];
  for (let i = 0; i < n; i++) {
    parts.push(base + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder--;
  }
  return parts;
}
