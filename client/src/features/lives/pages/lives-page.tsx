import { Link } from "react-router-dom";

import { EmptyState, LoadingState, RequestFailure } from "../../../components/feedback/feedback";
import { PageHeader } from "../../../components/layout/page-header";
import { buttonClassName } from "../../../components/ui/button-styles";
import { useStores } from "../hooks/use-lives";
import { StoreCard } from "../components/live-card";

export function StoresPage() {
  const stores = useStores();
  return (
    <>
      <PageHeader
        description="Create a store for each independent range of products you sell."
        eyebrow="Manage"
        title="Your Stores"
        action={<Link className={buttonClassName("primary")} to="/stores/new">Create Store</Link>}
      />
      {stores.isPending && <LoadingState label="Loading your Stores…" />}
      {stores.isError && <RequestFailure label="We couldn't load your Stores." onRetry={() => void stores.refetch()} />}
      {stores.data && stores.data.length === 0 && (
        <EmptyState
          action={<Link className={buttonClassName("primary")} to="/stores/new">Create your first Store</Link>}
          description="Add products to a Store, share its link, and manage its orders here."
          title="No Stores yet"
        />
      )}
      {stores.data && stores.data.length > 0 && (
        <section aria-label="Your Stores" className="grid gap-3">
          {stores.data.map((store) => <StoreCard key={store.id} store={store} />)}
        </section>
      )}
    </>
  );
}
