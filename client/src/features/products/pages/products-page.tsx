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
import { useStores } from "../../lives/hooks/use-lives";
import { StoreStatusBadge } from "../../lives/components/live-status-badge";
import { useDeleteProduct, useProducts } from "../hooks/use-products";
import type { Product } from "../api/products-api";

export function ProductsPage() {
  const { storeId = "" } = useParams();
  return <ProductsPageForStore key={storeId} storeId={storeId} />;
}

function ProductsPageForStore({ storeId }: { storeId: string }) {
  const location = useLocation();
  const pageSize = 20;
  const [page, setPage] = useState(1);
  const lives = useStores();
  const products = useProducts(storeId, page, pageSize);
  const deleteProduct = useDeleteProduct();
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [deletedNotice, setDeletedNotice] = useState(false);

  if (lives.isPending || products.isPending) {
    return <LoadingState label="Loading products for this Store…" />;
  }

  if (lives.isError && !lives.data) {
    return <RequestFailure label="We couldn't load this Store." onRetry={() => void lives.refetch()} />;
  }
  if (!lives.data) return <LoadingState label="Loading products for this Store…" />;

  const live = lives.data.find((item) => item.id === storeId);
  if (!live) {
    return (
      <EmptyState
        action={<Link className="font-semibold text-brand-700 underline" to="/stores">All Stores</Link>}
        description="This Store may have been removed or may not belong to your account."
        title="Store not found"
      />
    );
  }

  if (products.isError && !products.data) {
    return (
      <>
        <WorkspaceBackLink storeId={storeId} />
        <PageHeader eyebrow="Store workspace" title="Products" description={`Products for ${live.name}.`} />
        <RequestFailure label="We couldn't load this Store's products." onRetry={() => void products.refetch()} />
      </>
    );
  }
  if (!products.data) return <LoadingState label="Loading products for this Store…" />;

  const productPage = products.data;
  const liveProducts = productPage.data.filter((product) => product.storeId === storeId);

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
    ? "This product has order history and can't be deleted. It is still in this Store."
    : deleteProduct.error instanceof ApiError && deleteProduct.error.status === 404
      ? "This product is no longer available. Refresh the list and try again."
      : "We couldn't delete this product. It is still in this Store; please try again.";

  function confirmDelete() {
    if (!selectedProduct) return;
    deleteProduct.mutate(
      { storeId, productId: selectedProduct.id },
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
      <WorkspaceBackLink storeId={storeId} />
      <PageHeader
        action={<Link className={buttonClassName()} to={`/stores/${storeId}/products/new`}>Add product</Link>}
        description={`Products available for ${live.name}.`}
        eyebrow="Store workspace"
        title="Products"
      />
      <div className="mb-5 flex items-center gap-2 text-sm text-ink-muted">
        <span>Store status</span>
        <StoreStatusBadge status={live.status} />
        <span className="font-semibold text-ink">{live.name}</span>
      </div>

      {(lives.isFetching || products.isFetching) && <p aria-live="polite" className="mb-4 text-sm text-ink-muted">Refreshing product information…</p>}
      {(lives.isError || products.isError) && <div className="mb-5"><Notice title="The latest information could not be refreshed. Showing the last loaded data." /></div>}
      <div aria-live="polite" className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
        <span>{productPage.pagination.total} {productPage.pagination.total === 1 ? "product" : "products"} total</span>
        <span>Page {page} of {Math.max(productPage.pagination.totalPages, 1)}</span>
      </div>

      {noticeMessage && (
        <div className="mb-5">
          <Notice
            action={
              <div className="flex flex-wrap gap-2">
                <Link className={buttonClassName("secondary", "sm")} to={`/stores/${storeId}`}>Store workspace</Link>
                <Link className={buttonClassName("ghost", "sm")} to="/dashboard">Dashboard</Link>
                {live.status === "PUBLISHED" && <a className={buttonClassName("ghost", "sm")} href={`/live/${live.slug}`} rel="noopener noreferrer" target="_blank">Open storefront</a>}
              </div>
            }
            title={noticeMessage}
            tone="success"
          />
        </div>
      )}
      {deleteProduct.isError && selectedProduct === null && <div className="mb-5"><Notice title={deleteError} /></div>}

      {productPage.pagination.total === 0 ? (
        <EmptyState
          action={<Link className={buttonClassName()} to={`/stores/${storeId}/products/new`}>Add your first product</Link>}
          description="Add the items you plan to sell in this Store."
          title="No products yet"
        />
      ) : liveProducts.length === 0 ? (
        <EmptyState title="No products on this page" description="Go to the previous page to see this Store's products." />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {liveProducts.map((product) => {
            const primaryImage = product.images.find((image) => image.isPrimary) ?? product.images[0];
            return (
              <li key={product.id}>
                <Card className="h-full">
                  <CardContent className="flex h-full gap-3 sm:gap-4">
                    {primaryImage ? (
                      <img alt={product.name} className="size-20 shrink-0 rounded-panel bg-canvas object-cover sm:size-24" loading="lazy" src={primaryImage.url} />
                    ) : (
                      <div className="grid size-20 shrink-0 place-items-center rounded-panel bg-canvas text-center text-xs text-ink-muted sm:size-24">No image</div>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                        <h2 className="min-w-0 break-words text-base font-bold text-ink sm:text-lg">{product.name}</h2>
                        <p className="shrink-0 font-bold tabular-nums text-brand-800">{formatPesewas(product.price)}</p>
                      </div>
                      <p className={`mt-1 text-xs font-semibold sm:text-sm ${product.stockQuantity === 0 ? "text-danger-700" : product.stockQuantity <= 5 ? "text-status-warn-ink" : "text-ink-muted"}`}>
                        {product.stockQuantity === 0 ? "Out of stock" : product.stockQuantity <= 5 ? `Low stock · ${product.stockQuantity} left` : `${product.stockQuantity} in stock`}
                      </p>
                      <ProductOptions options={product.options} />
                      <div className="mt-auto flex flex-wrap gap-2 pt-3">
                      <Link to={`/stores/${storeId}/products/${encodeURIComponent(product.id)}/edit`}>
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
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <nav aria-label="Product pages" className="mt-6 flex items-center justify-between gap-4 border-t border-border pt-4">
        <Button disabled={page <= 1 || products.isFetching} onClick={() => setPage((currentPage) => currentPage - 1)} type="button" variant="secondary">Previous</Button>
        <span className="text-sm text-ink-muted">Page {page} of {Math.max(productPage.pagination.totalPages, 1)}</span>
        <Button disabled={!productPage.pagination.hasNextPage || products.isFetching} onClick={() => setPage((currentPage) => currentPage + 1)} type="button" variant="secondary">Next</Button>
      </nav>

      <ConfirmationDialog
        cancelLabel="Keep product"
        confirmLabel="Delete product"
        description={`“${selectedProduct?.name ?? "This product"}” will be removed from this Store if it has no order history.`}
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

function WorkspaceBackLink({ storeId }: { storeId: string }) {
  return (
    <Link className="mb-5 inline-flex text-sm font-semibold text-brand-700 hover:text-brand-900" to={`/stores/${storeId}`}>
      ← Store workspace
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
