import { Link } from "react-router-dom";

import { Card, CardContent } from "../../../components/ui/card";
import { buttonClassName } from "../../../components/ui/button-styles";
import type { Live } from "../api/lives-api";
import { LiveStatusBadge } from "./live-status-badge";

function formatDate(value: string | null) {
  if (!value) return "Date unavailable";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat("en-GH", { dateStyle: "medium" }).format(date);
}

export function LiveCard({ live }: { live: Live }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-bold text-ink">{live.name}</h2>
            <LiveStatusBadge status={live.status} />
          </div>
          <p className="text-sm text-ink-muted">Created {formatDate(live.createdAt)}</p>
        </div>
        <Link className={buttonClassName("secondary", "sm")} to={`/lives/${live.id}`}>
          Open Live
        </Link>
      </CardContent>
    </Card>
  );
}
