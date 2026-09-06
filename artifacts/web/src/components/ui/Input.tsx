import {
  type InputHTMLAttributes,
  type ReactNode,
  useId,
} from "react";
import { cn } from "./cn";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "prefix"> {
  label?: string;
  error?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
}

export function Input({
  className,
  label,
  error,
  prefix,
  suffix,
  id: idProp,
  ...props
}: InputProps) {
  const id = idProp ?? useId();
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-ink-soft">
          {label}
        </label>
      )}
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
            {prefix}
          </span>
        )}
        <input
          id={id}
          className={cn(
            "h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted/70",
            "focus:outline-2 focus:outline-offset-1 focus:outline-pine",
            "disabled:cursor-not-allowed disabled:opacity-50",
            prefix && "pl-7",
            suffix && "pr-7",
            error && "border-ember focus:outline-ember",
            className,
          )}
          {...props}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">
            {suffix}
          </span>
        )}
      </div>
      {error && <span className="text-xs text-ember">{error}</span>}
    </div>
  );
}

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({
  className,
  label,
  error,
  id: idProp,
  ...props
}: TextareaProps) {
  const id = idProp ?? useId();
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-ink-soft">
          {label}
        </label>
      )}
      <textarea
        id={id}
        className={cn(
          "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70",
          "focus:outline-2 focus:outline-offset-1 focus:outline-pine",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-ember focus:outline-ember",
          className,
        )}
        {...props}
      />
      {error && <span className="text-xs text-ember">{error}</span>}
    </div>
  );
}
