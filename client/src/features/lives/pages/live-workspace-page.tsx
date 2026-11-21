import { useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { EmptyState, LoadingState, Notice, RequestFailure } from "../../../components/feedback/feedback";
import { PageHeader } from "../../../components/layout/page-header";
import { ConfirmationDialog } from "../../../components/ui/confirmation-dialog";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { TextField } from "../../../components/ui/text-field";
import { ApiError } from "../../../lib/api-client";
import { StoreStatusBadge } from "../components/live-status-badge";
import { usePublishStore, useStores, useUnpublishStore, useUpdateStore } from "../hooks/use-lives";

export function StoreWorkspacePage() {
  const { storeId = "" } = useParams();
  const location = useLocation();
  const stores = useStores({ refetchOnMount: "always" });
  const updateStore = useUpdateStore();
  const publishStore = usePublishStore();
  const unpublishStore = useUnpublishStore();
  const [unpublishDialogOpen, setUnpublishDialogOpen] = useState(false);

  if (stores.isPending) return <LoadingState label="Loading this Store…" />;
  if (stores.isError && !stores.data) return <RequestFailure label="We couldn't load this Store." onRetry={() => void stores.refetch()} />;
  if (!stores.data) return <LoadingState label="Loading this Store…" />;

  const store = stores.data.find((item) => item.id === storeId);
  if (!store) {
    return <EmptyState
      action={<div className="flex flex-wrap justify-center gap-3"><Button onClick={() => void stores.refetch()} type="button" variant="secondary">Try again</Button><Link className="inline-flex min-h-11 items-center rounded-control px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50" to="/stores">All Stores</Link></div>}
      description="It may no longer belong to your account, or the Store list may need refreshing."
      title="Store not found"
    />;
  }

  const isTransitionPending = publishStore.isPending || unpublishStore.isPending;
  const mutationError = [updateStore.error, publishStore.error, unpublishStore.error].find((error) => error instanceof ApiError);
  const mutationMessage = mutationError instanceof ApiError && mutationError.status === 409
    ? "This Store's status changed. Refresh the page before trying again."
    : mutationError instanceof ApiError && mutationError.status === 404
      ? "This Store is no longer available in your account."
      : "We couldn't update this Store. Try again.";
  const showCreatedNotice = typeof location.state === "object" && location.state !== null && "created" in location.state && location.state.created === true;

  return (
    <>
      <Link className="mb-5 inline-flex text-sm font-semibold text-brand-700 hover:text-brand-900" to="/stores">← All Stores</Link>
      <PageHeader description="Manage this Store, its products, orders, payment instructions, and customer link." eyebrow="Store workspace" title={store.name} action={<StoreStatusBadge status={store.status} />} />
      {stores.isFetching && <p aria-live="polite" className="mb-4 text-sm text-ink-muted">Refreshing Store details…</p>}
      {stores.isError && <div className="mb-5"><Notice title="Store details could not be refreshed. Your current work remains available." /></div>}
      {showCreatedNotice && <div className="mb-5"><Notice title="Store created as a draft." tone="success" /></div>}
      {mutationError && <div className="mb-5"><Notice title={mutationMessage} /></div>}

      <Card className="mb-5">
        <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-ink">Store publication</h2>
            <p className="mt-1 text-sm leading-6 text-ink-muted">
              {store.status === "DRAFT" && "This Store has not been published yet. Publish it when its products and payment details are ready."}
              {store.status === "PUBLISHED" && "Customers can browse this Store and place orders through its public link."}
              {store.status === "UNPUBLISHED" && "This Store is offline. Its products and orders are saved, and you can publish it again at any time."}
            </p>
            <p className="mt-2 text-sm text-ink-muted">Store address: <span className="font-semibold text-ink">/{store.slug}</span></p>
          </div>
          {store.status === "PUBLISHED" ? (
            <Button disabled={isTransitionPending} onClick={() => setUnpublishDialogOpen(true)} type="button" variant="danger">Take Store offline</Button>
          ) : (
            <Button disabled={isTransitionPending} onClick={() => publishStore.mutate(storeId)} type="button">
              {publishStore.isPending ? "Publishing…" : store.status === "DRAFT" ? "Publish Store" : "Publish again"}
            </Button>
          )}
        </CardContent>
      </Card>

      <TikTokLiveLinkEditor key={store.id} storeId={store.id} value={store.tiktokLiveUrl} />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <WorkspaceCard description="Add products, options, images, and inventory for this Store." title="Products" to={`/stores/${store.id}/products`} />
        <WorkspaceCard description="Review customer orders and confirm payments for this Store." title="Orders" to={`/stores/${store.id}/orders`} />
        <WorkspaceCard description="Set the Mobile Money instructions customers see for new orders." title="Payment settings" to={`/stores/${store.id}/settings/payments`} />
      </div>

      {store.status === "PUBLISHED" && (
        <Card><CardContent>
          <p className="text-sm font-semibold text-ink">Share your Store</p>
          <p className="mt-1 text-sm text-ink-muted">Customers can browse products and order without creating an account.</p>
          <Link className="mt-3 inline-flex break-all text-sm font-semibold text-brand-700 underline decoration-brand-200 underline-offset-4" to={`/live/${store.slug}`}>
            {`${window.location.origin}/live/${store.slug}`}
          </Link>
        </CardContent></Card>
      )}

      <ConfirmationDialog
        cancelLabel="Keep Store published"
        confirmLabel="Take Store offline"
        description="Customers will no longer be able to browse this Store or place new orders. Your products and order history will remain saved."
        isPending={unpublishStore.isPending}
        onCancel={() => setUnpublishDialogOpen(false)}
        onConfirm={() => unpublishStore.mutate(storeId, { onSuccess: () => setUnpublishDialogOpen(false) })}
        open={unpublishDialogOpen}
        title="Unpublish this Store?"
      >
        {unpublishStore.isError && <Notice title={mutationMessage} />}
      </ConfirmationDialog>
    </>
  );
}

function TikTokLiveLinkEditor({ storeId, value }: { storeId: string; value: string | null }) {
  const [draftUrl, setDraftUrl] = useState<string | undefined>(undefined);
  const url = draftUrl ?? value ?? "";
  const [saved, setSaved] = useState(false);
  const updateStore = useUpdateStore();

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    updateStore.mutate({ storeId, input: { tiktokLiveUrl: url.trim() || null } }, {
      onSuccess: () => { setDraftUrl(undefined); setSaved(true); },
    });
  }

  const invalidUrl = updateStore.error instanceof ApiError && updateStore.error.status === 400;
  return (
    <Card className="mb-5"><CardContent>
      <form className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={save}>
        <TextField autoComplete="url" error={invalidUrl ? "Use an HTTPS URL from a supported TikTok domain." : undefined} hint="Optional legacy broadcast link." label="TikTok LIVE URL" onChange={(event) => { setDraftUrl(event.currentTarget.value); setSaved(false); }} placeholder="https://www.tiktok.com/@yourname/live" type="url" value={url} />
        <Button disabled={updateStore.isPending || url === (value ?? "")} type="submit">{updateStore.isPending ? "Saving link…" : "Save TikTok link"}</Button>
      </form>
      {updateStore.isError && !invalidUrl && <div className="mt-3"><Notice title="We couldn't save the TikTok LIVE link. Try again." /></div>}
      {saved && <div className="mt-3"><Notice title="TikTok LIVE link saved." tone="success" /></div>}
    </CardContent></Card>
  );
}

function WorkspaceCard({ title, description, to }: { title: string; description: string; to: string }) {
  return <Link className="group rounded-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2" to={to}><Card className="h-full transition duration-150 group-hover:-translate-y-0.5 group-hover:shadow-card"><CardContent className="flex h-full min-h-40 flex-col justify-between"><div><h2 className="text-lg font-bold text-ink">{title}</h2><p className="mt-2 text-sm leading-6 text-ink-muted">{description}</p></div><span className="mt-5 text-sm font-bold text-brand-700">Open {title.toLowerCase()} <span aria-hidden="true">→</span></span></CardContent></Card></Link>;
}
