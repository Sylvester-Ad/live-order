import type { ReactNode } from "react";

import { cx } from "../../lib/cx";

type StatusBadgeProps = {
  children: ReactNode;
  tone: "draft" | "active" | "ended" | "pending" | "paid" | "neutral";
};

const toneClasses: Record<StatusBadgeProps["tone"], string> = {
  draft: "bg-status-neutral-bg text-status-neutral-ink",
  ended: "bg-status-neutral-bg text-status-neutral-ink",
  neutral: "bg-status-neutral-bg text-status-neutral-ink",
  active: "bg-status-good-bg text-status-good-ink",
  paid: "bg-status-good-bg text-status-good-ink",
  pending: "bg-status-warn-bg text-status-warn-ink",
};

export function StatusBadge({ children, tone }: StatusBadgeProps) {
  return (
    <span
      className={cx(
        "inline-flex min-h-7 items-center rounded-full px-2.5 text-xs font-bold tracking-wide",
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}
