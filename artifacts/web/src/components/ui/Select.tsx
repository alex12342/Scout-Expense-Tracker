import { type SelectHTMLAttributes, useId } from "react";
import { cn } from "./cn";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function Select({
  className,
  label,
  error,
  options,
  placeholder,
  id: idProp,
  ...props
}: SelectProps) {
  const id = idProp ?? useId();
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-ink-soft">
          {label}
        </label>
      )}
      <select
        id={id}
        className={cn(
          "h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink",
          "focus:outline-2 focus:outline-offset-1 focus:outline-pine",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-ember focus:outline-ember",
          className,
        )}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-ember">{error}</span>}
    </div>
  );
}
