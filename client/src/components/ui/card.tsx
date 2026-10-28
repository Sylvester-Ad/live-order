import type { HTMLAttributes } from "react";

import { cx } from "../../lib/cx";

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cx("rounded-panel border border-border bg-surface shadow-card", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("p-5 sm:p-6", className)} {...props} />;
}
