import type { ReactNode } from "react";

import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-44 items-center justify-center gap-3 text-sm font-medium text-ink-muted" role="status">
      <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700 motion-reduce:animate-none" />
      <span>{label}</span>
    </div>
  );
}

export function Notice({
  title,
  children,
  tone = "error",
  action,
}: {
  title: string;
  children?: ReactNode;
  tone?: "error" | "success" | "info";
  action?: ReactNode;
}) {
  const tones = {
    error: "border-danger-200 bg-danger-50 text-danger-800",
    success: "border-status-good-border bg-status-good-bg text-status-good-ink",
    info: "border-brand-200 bg-brand-50 text-brand-900",
  };

  return (
    <div className={`rounded-control border p-4 ${tones[tone]}`} role={tone === "error" ? "alert" : "status"}>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm opacity-90">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex min-h-56 flex-col items-center justify-center text-center">
        <span aria-hidden="true" className="mb-4 grid size-12 place-items-center rounded-full bg-brand-50 text-xl text-brand-800">
          ↗
        </span>
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-ink-muted">{description}</p>
        {action && <div className="mt-5">{action}</div>}
      </CardContent>
    </Card>
  );
}

export function RequestFailure({
  onRetry,
  label = "We couldn't load this information.",
}: {
  onRetry: () => void;
  label?: string;
}) {
  return (
    <Notice
      title={label}
      action={
        <Button onClick={onRetry} size="sm" variant="secondary">
          Try again
        </Button>
      }
    />
  );
}
