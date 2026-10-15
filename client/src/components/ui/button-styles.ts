import { cx } from "../../lib/cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-700 text-white shadow-sm hover:bg-brand-800 focus-visible:ring-brand-600 disabled:bg-brand-300",
  secondary:
    "border border-border bg-white text-ink hover:bg-canvas focus-visible:ring-brand-600 disabled:text-ink-muted",
  ghost:
    "bg-transparent text-ink-muted hover:bg-brand-50 hover:text-brand-800 focus-visible:ring-brand-600 disabled:text-ink-faint",
  danger:
    "bg-danger-700 text-white shadow-sm hover:bg-danger-800 focus-visible:ring-danger-700 disabled:bg-danger-300",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-5 text-base",
};

export function buttonClassName(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
) {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed",
    variantClasses[variant],
    sizeClasses[size],
    className,
  );
}
