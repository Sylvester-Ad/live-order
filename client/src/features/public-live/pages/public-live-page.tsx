import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";

import { LoadingState, Notice, RequestFailure } from "../../../components/feedback/feedback";
import { PageHeader } from "../../../components/layout/page-header";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { ApiError } from "../../../lib/api-client";
import { formatPesewas } from "../../../lib/format-money";
import { readProductOptionGroups } from "../../../lib/product-options";
import { useCreateCustomerOrder } from "../../orders/hooks/use-create-customer-order";
import type { PublicLive } from "../api/public-live-api";
import { usePublicLive } from "../hooks/use-public-live";

type ContactFields = { customerName: string; customerPhone: string; deliveryLocation: string };

export function PublicLivePage() {
  const { slug = "" } = useParams();
  const liveQuery = usePublicLive(slug);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selections, setSelections] = useState<Record<string, Record<string, string>>>({});
  const [contact, setContact] = useState<ContactFields>({ customerName: "", customerPhone: "", deliveryLocation: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const placeOrder = useCreateCustomerOrder();

  if (liveQuery.isPending) return <LoadingState label="Loading this Live…" />;
  if (liveQuery.error instanceof ApiError && liveQuery.error.status === 404) {
    return <Notice title="This Live isn't available right now." tone="info">It may have ended, or the seller's link may have changed.</Notice>;
  }
  if (liveQuery.isError) return <RequestFailure label="We couldn't load this Live." onRetry={() => void liveQuery.refetch()} />;

  const live = liveQuery.data;
  const quantityFor = (product: PublicLive["products"][number]) => product.available
    ? Math.min(quantities[product.id] ?? 0, product.stockQuantity, 100)
    : 0;
  const selectedProducts = live.products.filter((product) => quantityFor(product) > 0);
  const estimatedTotal = selectedProducts.reduce((total, product) => total + product.price * quantityFor(product), 0);
  const orderError = placeOrder.error instanceof ApiError && placeOrder.error.code === "INSUFFICIENT_STOCK"
    ? "Stock changed while you were ordering. Review the updated availability and adjust your quantities before trying again. Your contact details are still here."
    : placeOrder.error instanceof ApiError && placeOrder.error.code === "INVALID_PRODUCT_OPTIONS"
      ? "One of the selected options is no longer available. Review your choices and try again."
      : "We couldn't place this order. Check your details and try again.";

  function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (selectedProducts.length === 0) {
      setFormError("Choose a quantity for at least one product.");
      return;
    }

    const items = selectedProducts.map((product) => ({
      productId: product.id,
      quantity: quantityFor(product),
      ...(Object.keys(selections[product.id] ?? {}).length > 0
        ? { selectedOptions: selections[product.id] }
        : {}),
    }));

    placeOrder.mutate({ liveId: live.id, input: { ...contact, items } });
  }

  if (placeOrder.isSuccess) {
    return (
      <>
        <PageHeader description={`Your request has been sent to ${live.name}'s seller.`} eyebrow="Order received" title="Thanks for your order" />
        <Card><CardContent className="grid gap-3">
          <p className="font-semibold text-ink">Order reference</p>
          <p className="break-all font-mono text-sm text-ink-muted">{placeOrder.data.id}</p>
          <p className="text-sm text-ink-muted">The seller manages payment confirmation. Contact them to arrange payment and delivery.</p>
        </CardContent></Card>
      </>
    );
  }

  return (
    <>
      <PageHeader description="Choose products and quantities, then send your order to the seller." eyebrow="LiveOrder storefront" title={live.name} />
      {live.products.length === 0 ? (
        <Card><CardContent><p className="font-semibold text-ink">Products will appear here when the seller adds them.</p></CardContent></Card>
      ) : (
        <form className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]" onSubmit={submitOrder}>
          <div className="grid gap-4 sm:grid-cols-2">
            {live.products.map((product) => {
              const optionGroups = readProductOptionGroups(product.options);
              const quantity = quantityFor(product);
              return (
                <Card key={product.id}>
                  <CardContent className="grid gap-3">
                    <ProductImage src={product.image?.url} name={product.name} />
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="font-bold text-ink">{product.name}</h2>
                      <p className="shrink-0 font-bold tabular-nums text-brand-800">{formatPesewas(product.price)}</p>
                    </div>
                    {!product.available || product.stockQuantity === 0 ? (
                      <p className="text-sm font-semibold text-danger-700">Out of stock</p>
                    ) : (
                      <>
                        <p className="text-sm text-ink-muted">{product.stockQuantity} available</p>
                        {optionGroups.supported && optionGroups.groups.map((group) => (
                          <label className="grid gap-1.5 text-sm font-medium text-ink" key={`${product.id}:${group.id}`}>
                            {group.name}
                            <select
                              aria-label={`Choose ${group.name} for ${product.name}`}
                              className="min-h-11 rounded-control border border-border bg-white px-3 outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                              onChange={(event) => setSelections((current) => {
                                const nextSelection = { ...current[product.id] };
                                if (event.target.value) nextSelection[group.name] = event.target.value;
                                else delete nextSelection[group.name];
                                return { ...current, [product.id]: nextSelection };
                              })}
                              value={selections[product.id]?.[group.name] ?? ""}
                            >
                              <option value="">No preference</option>
                              {group.choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
                            </select>
                          </label>
                        ))}
                        {!optionGroups.supported && product.options != null && (
                          <p className="text-sm text-ink-muted">This product has older option details; contact the seller to confirm your preference.</p>
                        )}
                        <label className="grid max-w-40 gap-1.5 text-sm font-medium text-ink">
                          Quantity
                          <input
                            aria-label={`Quantity for ${product.name}`}
                            className="min-h-11 rounded-control border border-border px-3 outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                            max={Math.min(product.stockQuantity, 100)}
                            min={0}
                            onChange={(event) => {
                              const value = event.target.value === "" ? 0 : Number(event.target.value);
                              if (Number.isInteger(value)) setQuantities((current) => ({ ...current, [product.id]: Math.min(Math.max(0, value), product.stockQuantity, 100) }));
                            }}
                            step={1}
                            type="number"
                            value={quantity}
                          />
                        </label>
                        {product.stockQuantity > 100 && <p className="text-xs text-ink-muted">Up to 100 units of this product per order.</p>}
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <aside className="h-fit rounded-panel border border-border bg-white p-5 lg:sticky lg:top-5">
            <h2 className="text-lg font-bold text-ink">Your order</h2>
            <p className="mt-1 text-sm text-ink-muted">The seller confirms payment and delivery with you.</p>
            {selectedProducts.length === 0 ? (
              <p className="mt-4 text-sm text-ink-muted">Select products to start your order.</p>
            ) : (
              <ul className="mt-4 grid gap-2 border-b border-border pb-4 text-sm">
                {selectedProducts.map((product) => <li className="flex justify-between gap-3" key={product.id}><span>{product.name} × {quantityFor(product)}</span><span className="shrink-0 tabular-nums">{formatPesewas(product.price * quantityFor(product))}</span></li>)}
              </ul>
            )}
            <p className="mt-4 flex justify-between font-bold text-ink"><span>Estimated total</span><span className="tabular-nums">{formatPesewas(estimatedTotal)}</span></p>
            <p className="mt-1 text-xs text-ink-muted">Final total is calculated by the seller's server.</p>
            <div className="mt-5 grid gap-3">
              <label className="grid gap-1.5 text-sm font-medium text-ink">Your name<input autoComplete="name" className="min-h-11 rounded-control border border-border px-3" maxLength={100} onChange={(event) => setContact({ ...contact, customerName: event.target.value })} required value={contact.customerName} /></label>
              <label className="grid gap-1.5 text-sm font-medium text-ink">Phone number<input autoComplete="tel" className="min-h-11 rounded-control border border-border px-3" maxLength={30} onChange={(event) => setContact({ ...contact, customerPhone: event.target.value })} required type="tel" value={contact.customerPhone} /></label>
              <label className="grid gap-1.5 text-sm font-medium text-ink">Delivery location<input autoComplete="street-address" className="min-h-11 rounded-control border border-border px-3" maxLength={300} onChange={(event) => setContact({ ...contact, deliveryLocation: event.target.value })} required value={contact.deliveryLocation} /></label>
              {formError && <p className="text-sm text-danger-700" role="alert">{formError}</p>}
              {placeOrder.isError && <Notice title={orderError} />}
              {placeOrder.isError && placeOrder.error instanceof ApiError && placeOrder.error.code === "INSUFFICIENT_STOCK" && (
                <Button onClick={() => void liveQuery.refetch()} type="button" variant="secondary">Refresh availability</Button>
              )}
              <Button disabled={placeOrder.isPending || selectedProducts.length === 0} type="submit">
                {placeOrder.isPending ? "Sending order…" : "Place order"}
              </Button>
            </div>
          </aside>
        </form>
      )}
    </>
  );
}

function ProductImage({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    <img alt={name} className="aspect-4/3 w-full rounded-panel bg-canvas object-cover" onError={() => setFailed(true)} src={src} />
  ) : (
    <div className="grid aspect-4/3 place-items-center rounded-panel bg-canvas text-sm text-ink-muted">Image unavailable</div>
  );
}
