import { useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { EmptyState, LoadingState, Notice, RequestFailure } from "../../../components/feedback/feedback";
import { PageHeader } from "../../../components/layout/page-header";
import { ConfirmationDialog } from "../../../components/ui/confirmation-dialog";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { TextField } from "../../../components/ui/text-field";
import { ApiError } from "../../../lib/api-client";
import { LiveStatusBadge } from "../components/live-status-badge";
import { useLives, useUpdateLive } from "../hooks/use-lives";

export function LiveWorkspacePage() {
  const { liveId = "" } = useParams();
  const location = useLocation();
  const lives = useLives({ refetchOnMount: "always" });
  const updateLive = useUpdateLive();
  const [endDialogOpen, setEndDialogOpen] = useState(false);

  if (lives.isPending || lives.isFetching) return <LoadingState label="Loading this Live…" />;
  if (lives.isError) {
    return <RequestFailure label="We couldn't load this Live." onRetry={() => void lives.refetch()} />;
  }

  const live = lives.data?.find((item) => item.id === liveId);
  if (!live) {
    return (
      <EmptyState
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={() => void lives.refetch()} type="button" variant="secondary">Try again</Button>
            <Link className="inline-flex min-h-11 items-center rounded-control px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50" to="/lives">All Lives</Link>
          </div>
        }
        description="It may have been removed from your account, or the list may need to be refreshed."
        title="Live not found"
      />
    );
  }

  const mutationError = updateLive.error instanceof ApiError && updateLive.error.status === 409
    ? "This Live's status has changed. Refresh the page before trying again."
    : updateLive.error instanceof ApiError && updateLive.error.status === 404
      ? "This Live is no longer available in your account."
      : "We couldn't update this Live. Try again.";
  const showCreatedNotice = typeof location.state === "object" &&
    location.state !== null &&
    "created" in location.state &&
    location.state.created === true;

  function transitionTo(status: "ACTIVE" | "ENDED") {
    updateLive.mutate(
      { liveId, input: { status } },
      { onSuccess: () => setEndDialogOpen(false) },
    );
  }

  return (
    <>
      <Link className="mb-5 inline-flex text-sm font-semibold text-brand-700 hover:text-brand-900" to="/lives">
        ← All Lives
      </Link>
      <PageHeader
        description="Manage this selling session and its next steps."
        eyebrow="Live workspace"
        title={live.name}
        action={<LiveStatusBadge status={live.status} />}
      />

      {showCreatedNotice && <div className="mb-5"><Notice title="Live created successfully." tone="success" /></div>}

      {updateLive.isError && live.status !== "ACTIVE" && (
        <div className="mb-5"><Notice title={mutationError} /></div>
      )}

      <Card className="mb-5">
        <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-ink">Session status</h2>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              {live.status === "DRAFT" && "This Live is not visible to customers yet. Activate it when you are ready to sell."}
              {live.status === "ACTIVE" && "This Live is active and available to customers at its public link."}
              {live.status === "ENDED" && "This Live has ended and cannot be reopened."}
            </p>
          </div>
          {live.status === "DRAFT" && (
            <Button disabled={updateLive.isPending} onClick={() => transitionTo("ACTIVE")} type="button">
              {updateLive.isPending ? "Activating…" : "Activate Live"}
            </Button>
          )}
          {live.status === "ACTIVE" && (
            <Button disabled={updateLive.isPending} onClick={() => setEndDialogOpen(true)} type="button" variant="danger">
              End Live
            </Button>
          )}
        </CardContent>
      </Card>

      <TikTokLiveLinkEditor liveId={live.id} value={live.tiktokLiveUrl} />

      <div className="grid gap-4 md:grid-cols-2">
        <WorkspaceCard
          description="Add products and review the information customers will see."
          title="Products"
          to={`/lives/${live.id}/products`}
        />
        <WorkspaceCard
          description="Review customer details, requested items, totals, and payment status."
          title="Orders"
          to={`/lives/${live.id}/orders`}
        />
      </div>

      {live.status === "ACTIVE" && (
        <Card className="mt-5">
          <CardContent>
            <p className="text-sm font-semibold text-ink">Customer link</p>
            <p className="mt-1 text-sm text-ink-muted">Share this link with customers to view the active Live.</p>
            <Link className="mt-3 inline-flex break-all text-sm font-semibold text-brand-700 underline decoration-brand-200 underline-offset-4" to={`/live/${live.slug}`}>
              {`${window.location.origin}/live/${live.slug}`}
            </Link>
          </CardContent>
        </Card>
      )}

      <ConfirmationDialog
        cancelLabel="Keep Live active"
        confirmLabel="End Live"
        description="Customers will no longer be able to view this Live as active. This action cannot be undone."
        isPending={updateLive.isPending}
        onCancel={() => setEndDialogOpen(false)}
        onConfirm={() => transitionTo("ENDED")}
        open={endDialogOpen}
        title="End this Live?"
      >
        {updateLive.isError && <Notice title={mutationError} />}
      </ConfirmationDialog>
    </>
  );
}

function TikTokLiveLinkEditor({ liveId, value }: { liveId: string; value: string | null }) {
  const [url, setUrl] = useState(value ?? "");
  const [saved, setSaved] = useState(false);
  const updateLive = useUpdateLive();

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    updateLive.mutate(
      { liveId, input: { tiktokLiveUrl: url.trim() || null } },
      { onSuccess: () => setSaved(true) },
    );
  }

  const invalidUrl = updateLive.error instanceof ApiError && updateLive.error.status === 400;

  return (
    <Card className="mb-5">
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={save}>
          <TextField
            autoComplete="url"
            error={invalidUrl ? "Use an HTTPS URL from tiktok.com, www.tiktok.com, m.tiktok.com, or live.tiktok.com." : undefined}
            hint="Optional. Add or update the broadcast link customers can return to."
            label="TikTok LIVE URL"
            onChange={(event) => { setUrl(event.currentTarget.value); setSaved(false); }}
            placeholder="https://www.tiktok.com/@yourname/live"
            type="url"
            value={url}
          />
          <Button disabled={updateLive.isPending || url === (value ?? "")} type="submit">
            {updateLive.isPending ? "Saving link…" : "Save TikTok link"}
          </Button>
        </form>
        {updateLive.isError && !invalidUrl && <div className="mt-3"><Notice title="We couldn't save the TikTok LIVE link. Try again." /></div>}
        {saved && <div className="mt-3"><Notice title="TikTok LIVE link saved." tone="success" /></div>}
      </CardContent>
    </Card>
  );
}

function WorkspaceCard({ title, description, to }: { title: string; description: string; to: string }) {
  return (
    <Link className="group rounded-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2" to={to}>
      <Card className="h-full transition duration-150 group-hover:-translate-y-0.5 group-hover:shadow-card">
        <CardContent className="flex h-full min-h-40 flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">{description}</p>
          </div>
          <span className="mt-5 text-sm font-bold text-brand-700">Open {title.toLowerCase()} <span aria-hidden="true">→</span></span>
        </CardContent>
      </Card>
    </Link>
  );
}
