import { Link } from "react-router-dom";

import { EmptyState, LoadingState, RequestFailure } from "../../../components/feedback/feedback";
import { PageHeader } from "../../../components/layout/page-header";
import { buttonClassName } from "../../../components/ui/button-styles";
import { useLives } from "../hooks/use-lives";
import { LiveCard } from "../components/live-card";

export function LivesPage() {
  const lives = useLives();

  return (
    <>
      <PageHeader
        description="Your saved selling sessions, newest first."
        eyebrow="Manage"
        title="Lives"
        action={
          <Link className={buttonClassName("primary")} to="/lives/new">Create Live</Link>
        }
      />
      {lives.isPending && <LoadingState label="Loading your Lives…" />}
      {lives.isError && <RequestFailure label="We couldn't load your Lives." onRetry={() => void lives.refetch()} />}
      {lives.data && lives.data.length === 0 && (
        <EmptyState
          action={<Link className={buttonClassName("primary")} to="/lives/new">Create your first Live</Link>}
          description="Create a Live to organize a selling session, its products, and customer orders."
          title="No Lives yet"
        />
      )}
      {lives.data && lives.data.length > 0 && (
        <section aria-label="Your Lives" className="grid gap-3">
          {lives.data.map((live) => <LiveCard key={live.id} live={live} />)}
        </section>
      )}
    </>
  );
}
