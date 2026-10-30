import { Link } from "react-router-dom";

import { EmptyState, LoadingState, RequestFailure } from "../../../components/feedback/feedback";
import { PageHeader } from "../../../components/layout/page-header";
import { buttonClassName } from "../../../components/ui/button-styles";
import { Card, CardContent } from "../../../components/ui/card";
import { LiveStatusBadge } from "../../lives/components/live-status-badge";
import type { Live } from "../../lives/api/lives-api";
import { useCurrentCreator } from "../../auth/hooks/use-auth";
import { useLives } from "../../lives/hooks/use-lives";

const recentLivesLimit = 3;

function formatCreatedAt(createdAt: string | null) {
  if (!createdAt) return "Date unavailable";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function LiveRow({ live }: { live: Live }) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-semibold text-ink">{live.name}</h3>
          <LiveStatusBadge status={live.status} />
        </div>
        <p className="mt-1 text-sm text-ink-muted">Created {formatCreatedAt(live.createdAt)}</p>
      </div>
      <Link
        aria-label={`Open ${live.name} workspace`}
        className={buttonClassName("secondary", "sm", "w-full sm:w-auto")}
        to={`/lives/${encodeURIComponent(live.id)}`}
      >
        Open workspace
      </Link>
    </div>
  );
}

export function DashboardPage() {
  const lives = useLives();
  const creator = useCurrentCreator();
  const creatorName = creator.data?.name.trim();
  const loadedLives = lives.isSuccess && !lives.isError ? lives.data : undefined;
  const activeLives = loadedLives?.filter((live) => live.status === "ACTIVE") ?? [];
  const recentLives = loadedLives?.slice(0, recentLivesLimit) ?? [];
  const summary = loadedLives
    ? [
        { label: "Total Lives", count: loadedLives.length },
        { label: "Active Lives", count: activeLives.length },
        { label: "Draft Lives", count: loadedLives.filter((live) => live.status === "DRAFT").length },
        { label: "Ended Lives", count: loadedLives.filter((live) => live.status === "ENDED").length },
      ]
    : undefined;

  return (
    <>
      <PageHeader
        description="See what is happening in your selling workspace and jump back into a session."
        eyebrow="Seller workspace"
        title={creatorName ? `Welcome back, ${creatorName}` : "Your business at a glance"}
        action={<Link className={buttonClassName("primary")} to="/lives/new">Create a Live</Link>}
      />

      {lives.isPending && <LoadingState label="Loading your Lives…" />}
      {lives.isError && (
        <RequestFailure label="We couldn't load your Lives." onRetry={() => void lives.refetch()} />
      )}
      {summary && (
        <section aria-label="Live summary" className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {summary.map(({ label, count }) => (
            <Card key={label}>
              <CardContent className="p-4 sm:p-5">
                <p className="text-sm font-medium text-ink-muted">{label}</p>
                <p className="mt-2 text-3xl font-bold tabular-nums text-ink">{count}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {loadedLives && (
        <div className="grid gap-8">
          <section aria-labelledby="active-lives-title">
            <div className="mb-3">
              <h2 className="text-xl font-bold text-ink" id="active-lives-title">Active selling sessions</h2>
              <p className="mt-1 text-sm text-ink-muted">Pick up where you left off.</p>
            </div>
            {activeLives.length > 0 ? (
              <Card>
                <CardContent className="divide-y divide-border py-0">
                  {activeLives.map((live) => <LiveRow key={live.id} live={live} />)}
                </CardContent>
              </Card>
            ) : (
              <EmptyState
                action={<Link className={buttonClassName("secondary")} to="/lives/new">Create a Live</Link>}
                description="When you start a selling session, it will be ready to manage here."
                title="No active Lives right now"
              />
            )}
          </section>

          <section aria-labelledby="recent-lives-title">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-ink" id="recent-lives-title">Recent Lives</h2>
                <p className="mt-1 text-sm text-ink-muted">Your latest sessions, newest first.</p>
              </div>
              <Link className={buttonClassName("ghost", "sm")} to="/lives">View all Lives</Link>
            </div>
            {recentLives.length > 0 ? (
              <Card>
                <CardContent className="divide-y divide-border py-0">
                  {recentLives.map((live) => <LiveRow key={live.id} live={live} />)}
                </CardContent>
              </Card>
            ) : (
              <p className="rounded-panel border border-dashed border-border px-5 py-8 text-center text-sm text-ink-muted">
                No Lives yet. Create your first Live to get started.
              </p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
