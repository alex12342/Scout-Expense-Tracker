import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine disabled:pointer-events-none disabled:opacity-50 h-9 px-4",
  {
    variants: {
      variant: {
        primary: "bg-pine text-white hover:bg-pine-deep",
        secondary: "bg-pine-soft text-pine hover:bg-moss-soft",
        outline: "border border-line bg-transparent text-ink hover:bg-pine-soft/50",
        ghost: "text-ink-soft hover:bg-pine-soft/50 hover:text-ink",
        destructive: "bg-ember text-white hover:bg-ember/90",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3 text-xs",
        lg: "h-10 px-6",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export function ButtonLoading({
  children,
  className,
  variant,
  size,
  disabled,
  ...props
}: ButtonProps & { children?: ReactNode }) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), "opacity-70 cursor-wait", className)}
      disabled={true}
      {...props}
    >
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {children}
    </button>
  );
}
