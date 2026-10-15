import { useParams } from "react-router-dom";

import { LoadingState, Notice, RequestFailure } from "../../../components/feedback/feedback";
import { PageHeader } from "../../../components/layout/page-header";
import { Card, CardContent } from "../../../components/ui/card";
import { ApiError } from "../../../lib/api-client";
import { formatPesewas } from "../../../lib/format-money";
import { usePublicLive } from "../hooks/use-public-live";

export function PublicLivePage() {
  const { slug = "" } = useParams();
  const live = usePublicLive(slug);

  if (live.isPending) return <LoadingState label="Loading this Live…" />;
  if (live.error instanceof ApiError && live.error.status === 404) {
    return (
      <Notice title="This Live isn't available right now." tone="info">
        It may have ended, or the seller's link may have changed.
      </Notice>
    );
  }
  if (live.isError) {
    return <RequestFailure label="We couldn't load this Live." onRetry={() => void live.refetch()} />;
  }

  return (
    <>
      <PageHeader
        description="Browse the products featured in this selling session."
        eyebrow="LiveOrder storefront"
        title={live.data.name}
      />
      {live.data.products.length === 0 ? (
        <Card>
          <CardContent>
            <p className="font-semibold text-ink">Products will appear here when the seller adds them.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {live.data.products.map((product) => (
            <Card key={product.id}>
              <CardContent>
                <div className="mb-6 grid aspect-4/3 place-items-center rounded-control bg-brand-50 text-brand-700">
                  <span className="text-sm font-semibold">Product</span>
                </div>
                <h2 className="font-bold text-ink">{product.name}</h2>
                <p className="mt-2 text-lg font-bold text-brand-800">{formatPesewas(product.price)}</p>
                {product.options != null && (
                  <p className="mt-2 text-xs text-ink-muted">Options available from the seller</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <div className="mt-6">
        <Notice title="Ordering will be available soon." tone="info">
          The seller has not enabled online ordering for this page yet. Payment status is managed by the seller.
        </Notice>
      </div>
    </>
  );
}
