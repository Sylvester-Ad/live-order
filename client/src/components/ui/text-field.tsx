import type { InputHTMLAttributes } from "react";
import { useId } from "react";

import { cx } from "../../lib/cx";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export function TextField({
  label,
  hint,
  error,
  id,
  className,
  ...inputProps
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const messageId = `${inputId}-message`;

  return (
    <div className="grid gap-2">
      <label className="text-sm font-semibold text-ink" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? messageId : undefined}
        className={cx(
          "min-h-12 w-full rounded-control border bg-white px-3.5 text-base text-ink outline-none transition placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1",
          error ? "border-danger-700" : "border-border hover:border-ink-faint",
          className,
        )}
        {...inputProps}
      />
      {(error || hint) && (
        <p
          className={cx("text-sm", error ? "text-danger-700" : "text-ink-muted")}
          id={messageId}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
