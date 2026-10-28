import { Link } from "react-router-dom";

import { EmptyState, LoadingState, RequestFailure } from "../../../components/feedback/feedback";
import { PageHeader } from "../../../components/layout/page-header";
import { buttonClassName } from "../../../components/ui/button-styles";
import { LiveCard } from "../../lives/components/live-card";
import { useLives } from "../../lives/hooks/use-lives";

export function DashboardPage() {
  const lives = useLives();

  return (
    <>
      <PageHeader
        description="A clear view of the selling sessions you have set up."
        eyebrow="Seller workspace"
        title="Your selling workspace"
        action={
          <Link className={buttonClassName("secondary")} to="/lives">
            View all Lives
          </Link>
        }
      />

      {lives.isPending && <LoadingState label="Loading your Lives…" />}
      {lives.isError && (
        <RequestFailure label="We couldn't load your Lives." onRetry={() => void lives.refetch()} />
      )}
      {lives.data && lives.data.length === 0 && (
        <EmptyState
          description="When you create a Live, it will appear here so you can manage its products and orders."
          title="Your first Live starts here"
        />
      )}
      {lives.data && lives.data.length > 0 && (
        <section aria-labelledby="recent-lives-title">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-lg font-bold text-ink" id="recent-lives-title">Your Lives</h2>
              <p className="mt-1 text-sm text-ink-muted">
                {lives.data.length} {lives.data.length === 1 ? "selling session" : "selling sessions"}
              </p>
            </div>
          </div>
          <div className="grid gap-3">
            {lives.data.slice(0, 4).map((live) => (
              <LiveCard key={live.id} live={live} />
            ))}
          </div>
          {lives.data.length > 4 && (
            <div className="mt-5 text-center">
              <Link className={buttonClassName("ghost")} to="/lives">See all {lives.data.length} Lives</Link>
            </div>
          )}
        </section>
      )}
    </>
  );
}
