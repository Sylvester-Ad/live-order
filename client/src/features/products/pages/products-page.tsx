import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";

import { EmptyState, LoadingState, Notice, RequestFailure } from "../../../components/feedback/feedback";
import { PageHeader } from "../../../components/layout/page-header";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { ConfirmationDialog } from "../../../components/ui/confirmation-dialog";
import { buttonClassName } from "../../../components/ui/button-styles";
import { ApiError } from "../../../lib/api-client";
import { formatPesewas } from "../../../lib/format-money";
import { useLives } from "../../lives/hooks/use-lives";
import { LiveStatusBadge } from "../../lives/components/live-status-badge";
import { useDeleteProduct, useProducts } from "../hooks/use-products";
import type { Product } from "../api/products-api";

export function ProductsPage() {
  const { liveId = "" } = useParams();
  const location = useLocation();
  const lives = useLives();
  const products = useProducts(liveId);
  const deleteProduct = useDeleteProduct();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [deletedNotice, setDeletedNotice] = useState(false);

  if (lives.isPending || lives.isFetching || products.isPending || products.isFetching) {
    return <LoadingState label="Loading products for this Live…" />;
  }

  if (lives.isError) {
    return <RequestFailure label="We couldn't load this Live." onRetry={() => void lives.refetch()} />;
  }

  const live = lives.data.find((item) => item.id === liveId);
  if (!live) {
    return (
      <EmptyState
        action={<Link className="font-semibold text-brand-700 underline" to="/lives">All Lives</Link>}
        description="This Live may have been removed or may not belong to your account."
        title="Live not found"
      />
    );
  }

  if (products.isError) {
    return (
      <>
        <WorkspaceBackLink liveId={liveId} />
        <PageHeader eyebrow="Live workspace" title="Products" description={`Products for ${live.name}.`} />
        <RequestFailure label="We couldn't load this Live's products." onRetry={() => void products.refetch()} />
      </>
    );
  }

  const liveProducts = products.data.filter((product) => product.liveId === liveId);

  const notice = location.state && typeof location.state === "object"
    ? location.state as { productNotice?: unknown }
    : undefined;
  const noticeMessage = notice?.productNotice === "created"
    ? "Product created."
    : notice?.productNotice === "updated"
      ? "Product changes saved."
      : deletedNotice
        ? "Product deleted."
        : null;
  const deleteError = deleteProduct.error instanceof ApiError && deleteProduct.error.code === "PRODUCT_IN_USE"
    ? "This product has order history and can't be deleted. It is still in this Live."
    : deleteProduct.error instanceof ApiError && deleteProduct.error.status === 404
      ? "This product is no longer available. Refresh the list and try again."
      : "We couldn't delete this product. It is still in this Live; please try again.";

  function confirmDelete() {
    if (!selectedProduct) return;
    deleteProduct.mutate(
      { liveId, productId: selectedProduct.id },
      {
        onSuccess: () => {
          setSelectedProduct(null);
          setDeletedNotice(true);
        },
      },
    );
  }

  return (
    <>
      <WorkspaceBackLink liveId={liveId} />
      <PageHeader
        action={<Link className={buttonClassName()} to={`/lives/${liveId}/products/new`}>Add product</Link>}
        description={`Products available for ${live.name}.`}
        eyebrow="Live workspace"
        title="Products"
      />
      <div className="mb-5 flex items-center gap-2 text-sm text-ink-muted">
        <span>Live status</span>
        <LiveStatusBadge status={live.status} />
        <span className="font-semibold text-ink">{live.name}</span>
      </div>

      {noticeMessage && <div className="mb-5"><Notice title={noticeMessage} tone="success" /></div>}
      {deleteProduct.isError && selectedProduct === null && <div className="mb-5"><Notice title={deleteError} /></div>}

      {liveProducts.length === 0 ? (
        <EmptyState
          action={<Link className={buttonClassName()} to={`/lives/${liveId}/products/new`}>Add your first product</Link>}
          description="Add the items you plan to sell in this Live."
          title="No products yet"
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {liveProducts.map((product) => (
            <li key={product.id}>
              <Card className="h-full">
                <CardContent className="flex h-full flex-col">
                  {product.image ? (
                    <img alt={`${product.name}`} className="mb-4 aspect-4/3 w-full rounded-panel bg-canvas object-cover" src={product.image.url} />
                  ) : (
                    <div className="mb-4 grid aspect-4/3 place-items-center rounded-panel bg-canvas text-sm text-ink-muted">No product image</div>
                  )}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2 className="min-w-0 break-words text-lg font-bold text-ink">{product.name}</h2>
                    <p className="shrink-0 text-lg font-bold tabular-nums text-brand-800">{formatPesewas(product.price)}</p>
                  </div>
                  <p className={`mt-2 text-sm font-semibold ${product.stockQuantity === 0 ? "text-danger-700" : product.stockQuantity <= 5 ? "text-status-warn-ink" : "text-ink-muted"}`}>
                    {product.stockQuantity === 0 ? "Out of stock" : product.stockQuantity <= 5 ? `Low stock · ${product.stockQuantity} left` : `${product.stockQuantity} in stock`}
                  </p>
                  <ProductOptions options={product.options} />
                  <div className="mt-auto flex flex-wrap gap-2 pt-5">
                    <Link to={`/lives/${liveId}/products/${encodeURIComponent(product.id)}/edit`}>
                      <Button size="sm" variant="secondary">Edit</Button>
                    </Link>
                    <Button
                      onClick={() => {
                        deleteProduct.reset();
                        setSelectedProduct(product);
                      }}
                      size="sm"
                      type="button"
                      variant="danger"
                    >
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ConfirmationDialog
        cancelLabel="Keep product"
        confirmLabel="Delete product"
        description={`“${selectedProduct?.name ?? "This product"}” will be removed from this Live if it has no order history.`}
        isPending={deleteProduct.isPending}
        onCancel={() => setSelectedProduct(null)}
        onConfirm={confirmDelete}
        open={selectedProduct !== null}
        title="Delete this product?"
      >
        {deleteProduct.isError && <Notice title={deleteError} />}
      </ConfirmationDialog>
    </>
  );
}

function WorkspaceBackLink({ liveId }: { liveId: string }) {
  return (
    <Link className="mb-5 inline-flex text-sm font-semibold text-brand-700 hover:text-brand-900" to={`/lives/${liveId}`}>
      ← Live workspace
    </Link>
  );
}

function ProductOptions({ options }: { options: unknown }) {
  if (typeof options !== "object" || options === null || Array.isArray(options)) return null;
  const entries = Object.entries(options);
  if (entries.length === 0) return null;

  return (
    <dl className="mt-4 grid gap-2 border-t border-border pt-4 text-sm sm:grid-cols-[auto_1fr]">
      {entries.map(([name, value]) => (
        <div className="contents" key={name}>
          <dt className="font-semibold text-ink-muted">{name}</dt>
          <dd className="break-words text-ink">{Array.isArray(value) && value.every((choice) => typeof choice === "string") ? value.join(" · ") : "Existing options"}</dd>
        </div>
      ))}
    </dl>
  );
}
