/** Format integer cents as dollars. */
export function formatMoney(
  cents: number,
  opts?: { sign?: boolean; compact?: boolean },
): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const body = `${dollars.toLocaleString("en-US")}.${String(rem).padStart(2, "0")}`;
  const sign = neg ? "-" : opts?.sign ? "+" : "";
  return `${sign}$${body}`;
}

/** Compact whole-dollar form for tight spaces ($1.2k). */
export function formatMoneyCompact(cents: number): string {
  const dollars = cents / 100;
  const neg = dollars < 0;
  const abs = Math.abs(dollars);
  if (abs >= 10000) return `${neg ? "-" : ""}$${(abs / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${neg ? "-" : ""}$${Math.round(abs).toLocaleString("en-US")}`;
}

/** Parse user-entered dollars ("12", "12.5", "$1,234.56") -> cents, or null. */
export function parseMoney(centsInput: string | number): number | null {
  if (typeof centsInput === "number") {
    return Number.isFinite(centsInput) ? Math.round(centsInput * 100) : null;
  }
  const cleaned = centsInput.replace(/[$,\s]/g, "");
  if (cleaned === "" || !/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  return sign * (Math.abs(parseInt(whole, 10)) * 100 + parseInt((frac + "00").slice(0, 2), 10));
}

/** Even split of `totalCents` across n parts (distributes remainder). */
export function evenSplit(totalCents: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(totalCents / n);
  let rem = totalCents - base * n;
  return Array.from({ length: n }, () => base + (rem-- > 0 ? 1 : 0));
}

/** Convert cents (2dp) to a dollars string for input fields. */
export function centsToInput(cents: number): string {
  const dollars = (Math.abs(cents) / 100).toFixed(2);
  return cents < 0 ? `-${dollars}` : dollars;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
