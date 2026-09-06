import { type ReactNode } from "react";
import { cn } from "./cn";

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "destructive" | "muted";
  className?: string;
}) {
  const variants = {
    default: "bg-pine-soft text-pine",
    success: "bg-moss-soft text-moss",
    warning: "bg-gold-soft text-gold",
    destructive: "bg-ember-soft text-ember",
    muted: "bg-line-soft text-muted",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
