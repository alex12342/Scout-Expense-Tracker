import {
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import { cn } from "./cn";
import { Button } from "./Button";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
  size = "md",
}: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizes = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl" };

  return (
    <div
      style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }}
      className="z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-ink/40 animate-fadein"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={ref}
        className={cn(
          "relative w-full max-h-[85vh] overflow-y-auto rounded-xl border border-line bg-surface shadow-lift animate-rise",
          "m-auto",
          sizes[size],
          className,
        )}
      >
        {(title || description) && (
          <div className="px-5 pt-5 pb-3">
            {title && (
              <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
            )}
            {description && (
              <p className="mt-1 text-sm text-muted">{description}</p>
            )}
          </div>
        )}
        <div className="px-5 pb-5 pt-2">{children}</div>
      </div>
    </div>
  );
}

export function DialogFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-end gap-2 mt-4", className)}>
      {children}
    </div>
  );
}

export function CancelButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" onClick={onClick}>
      Cancel
    </Button>
  );
}
