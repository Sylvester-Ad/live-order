import { Link } from "react-router-dom";

import { EmptyState, LoadingState, RequestFailure } from "../../../components/feedback/feedback";
import { PageHeader } from "../../../components/layout/page-header";
import { buttonClassName } from "../../../components/ui/button-styles";
import { Card, CardContent } from "../../../components/ui/card";
import { StoreStatusBadge } from "../../lives/components/live-status-badge";
import type { Store } from "../../lives/api/lives-api";
import { useCurrentCreator } from "../../auth/hooks/use-auth";
import { useStores } from "../../lives/hooks/use-lives";

const recentStoresLimit = 3;

function formatCreatedAt(createdAt: string | null) {
  if (!createdAt) return "Date unavailable";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function StoreRow({ store }: { store: Store }) {
  return <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold text-ink">{store.name}</h3><StoreStatusBadge status={store.status} /></div><p className="mt-1 text-sm text-ink-muted">/{store.slug} · Created {formatCreatedAt(store.createdAt)}</p></div><Link aria-label={`Open ${store.name} workspace`} className={buttonClassName("secondary", "sm", "w-full sm:w-auto")} to={`/stores/${encodeURIComponent(store.id)}`}>Manage Store</Link></div>;
}

export function DashboardPage() {
  const stores = useStores();
  const creator = useCurrentCreator();
  const creatorName = creator.data?.name.trim();
  const loadedStores = stores.isSuccess && !stores.isError ? stores.data : undefined;
  const recentStores = loadedStores?.slice(0, recentStoresLimit) ?? [];
  const summary = loadedStores ? [
    { label: "Total Stores", count: loadedStores.length },
    { label: "Published", count: loadedStores.filter((store) => store.status === "PUBLISHED").length },
    { label: "Drafts", count: loadedStores.filter((store) => store.status === "DRAFT").length },
    { label: "Unpublished", count: loadedStores.filter((store) => store.status === "UNPUBLISHED").length },
  ] : undefined;

  return <>
    <PageHeader description="Create and manage independent storefronts for your business." eyebrow="Seller workspace" title={creatorName ? `Welcome back, ${creatorName}` : "Your business at a glance"} action={<Link className={buttonClassName("primary")} to="/stores/new">Create a Store</Link>} />
    {stores.isPending && <LoadingState label="Loading your Stores…" />}
    {stores.isError && <RequestFailure label="We couldn't load your Stores." onRetry={() => void stores.refetch()} />}
    {summary && <section aria-label="Store summary" className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">{summary.map(({ label, count }) => <Card key={label}><CardContent className="p-4 sm:p-5"><p className="text-sm font-medium text-ink-muted">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums text-ink">{count}</p></CardContent></Card>)}</section>}
    {loadedStores && loadedStores.length === 0 && <EmptyState action={<Link className={buttonClassName("primary")} to="/stores/new">Create your first Store</Link>} description="Your Store is where customers browse your products and place orders." title="Start with your first Store" />}
    {recentStores.length > 0 && <Card><CardContent><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4"><div><h2 className="text-lg font-bold text-ink">Your Stores</h2><p className="mt-1 text-sm text-ink-muted">Choose a Store to manage its products, orders, and payment details.</p></div><Link className={buttonClassName("secondary", "sm")} to="/stores">View all Stores</Link></div><div className="divide-y divide-border">{recentStores.map((store) => <StoreRow key={store.id} store={store} />)}</div></CardContent></Card>}
  </>;
}
