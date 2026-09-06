import { type ReactNode } from "react";
import { cn } from "./cn";

export function StatCard({
  label,
  value,
  sub,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: "default" | "positive" | "negative" | "warning";
  className?: string;
}) {
  const tones = {
    default: "text-ink",
    positive: "text-moss",
    negative: "text-ember",
    warning: "text-gold",
  };
  return (
    <div className={cn("rounded-xl border border-line bg-surface p-4 shadow-card", className)}>
      <p className="text-xs font-medium uppercase tracking-wider text-muted">{label}</p>
      <p className={cn("mt-1 font-mono text-xl font-semibold tnum", tones[tone])}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}
