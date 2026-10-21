import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";

import { LoadingState, Notice, RequestFailure } from "../../../components/feedback/feedback";
import { PageHeader } from "../../../components/layout/page-header";
import { Button } from "../../../components/ui/button";
import { Card, CardContent } from "../../../components/ui/card";
import { buttonClassName } from "../../../components/ui/button-styles";
import { ApiError, TransportError } from "../../../lib/api-client";
import { formatPesewas } from "../../../lib/format-money";
import { readProductOptionGroups } from "../../../lib/product-options";
import type { CreateCustomerOrderInput, CreatedCustomerOrder } from "../../orders/api/orders-api";
import { clearPublicOrderIdempotencyKey, getPublicOrderIdempotencyKey } from "../../orders/lib/public-order-idempotency";
import { useCreateCustomerOrder } from "../../orders/hooks/use-create-customer-order";
import { addProductToCart, productQuantityInCart, removeCartLine, setCartLineQuantity, type PublicOrderCartLine } from "../lib/public-order-cart";
import type { PublicLive } from "../api/public-live-api";
import { usePublicLive } from "../hooks/use-public-live";

type ContactFields = { customerName: string; customerPhone: string; deliveryLocation: string };
type PendingSubmission = { liveSlug: string; key: string; input: CreateCustomerOrderInput };

export function PublicLivePage() {
  const { slug = "" } = useParams();
  const liveQuery = usePublicLive(slug);
  const [cart, setCart] = useState<PublicOrderCartLine[]>([]);
  const [addQuantities, setAddQuantities] = useState<Record<string, number>>({});
  const [selections, setSelections] = useState<Record<string, Record<string, string>>>({});
  const [contact, setContact] = useState<ContactFields>({ customerName: "", customerPhone: "", deliveryLocation: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [cartFeedback, setCartFeedback] = useState<string | null>(null);
  const [uncertainSubmission, setUncertainSubmission] = useState(false);
  const [uncertainConflict, setUncertainConflict] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [refreshingAvailability, setRefreshingAvailability] = useState(false);
  const [availabilityRefreshFailed, setAvailabilityRefreshFailed] = useState(false);
  const placeOrder = useCreateCustomerOrder();
  const pendingSubmission = useRef<PendingSubmission | null>(null);
  const cartPanelRef = useRef<HTMLElement>(null);
  const cartCloseButtonRef = useRef<HTMLButtonElement>(null);
  const cartTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!cartOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const cartTrigger = cartTriggerRef.current;
    document.body.style.overflow = "hidden";
    cartCloseButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setCartOpen(false);
        return;
      }
      if (event.key !== "Tab" || !cartPanelRef.current) return;
      const focusable = Array.from(cartPanelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (cartTrigger?.isConnected) cartTrigger.focus();
      else previouslyFocused?.focus();
    };
  }, [cartOpen]);

  if (liveQuery.isPending) return <LoadingState label="Loading this Live…" />;
  if (liveQuery.error instanceof ApiError && liveQuery.error.status === 404) {
    return <Notice title="This Live isn't available right now." tone="info">It may have ended, or the seller's link may have changed.</Notice>;
  }
  if (liveQuery.isError) return <RequestFailure label="We couldn't load this Live." onRetry={() => void liveQuery.refetch()} />;

  const live = liveQuery.data;
  const productById = new Map(live.products.map((product) => [product.id, product]));
  const cartLines = cart.map((line, index) => ({ ...line, index, product: productById.get(line.productId) }));
  const cartQuantity = cart.reduce((count, line) => count + line.quantity, 0);
  const cartTotal = cartLines.reduce((total, line) => total + (line.product ? line.product.price * line.quantity : 0), 0);
  const invalidStockLine = cartLines.find((line) =>
    !line.product || !line.product.available || productQuantityInCart(cart, line.productId) > line.product.stockQuantity,
  );
  const orderError = placeOrder.error instanceof ApiError && placeOrder.error.code === "INSUFFICIENT_STOCK"
    ? "Stock changed while you were ordering. Refresh availability, adjust your order, and submit again."
    : placeOrder.error instanceof ApiError && placeOrder.error.code === "INVALID_PRODUCT_OPTIONS"
      ? "One of the selected options is no longer available. Review your choices and try again."
      : placeOrder.error instanceof ApiError && placeOrder.error.code === "INVALID_PRODUCT"
        ? "A product in this order is no longer available. Refresh the Live and review your order."
        : placeOrder.error instanceof ApiError && placeOrder.error.code === "LIVE_NOT_ACTIVE"
          ? "This Live is no longer accepting orders."
          : placeOrder.error instanceof ApiError && placeOrder.error.code === "IDEMPOTENCY_KEY_REUSED"
            ? "We couldn't safely match this retry to the earlier submission. The earlier order may have been received; please contact the seller before placing another order."
            : placeOrder.error instanceof TransportError || (placeOrder.error instanceof ApiError && placeOrder.error.status >= 500)
              ? "We couldn't confirm whether the order reached the seller. Retry this same order; it will not create a duplicate."
              : "We couldn't place this order. Check your details and try again.";

  function updateContact(field: keyof ContactFields, value: string) {
    setContact((current) => ({ ...current, [field]: value }));
    if (!uncertainSubmission) placeOrder.reset();
  }

  function addToOrder(product: PublicLive["products"][number]) {
    const requestedQuantity = addQuantities[product.id] ?? 1;
    const result = addProductToCart(cart, product.id, requestedQuantity, selections[product.id] ?? {}, product.stockQuantity);
    setCart(result.cart);
    setCartFeedback(result.added > 0
      ? `Added ${result.added} ${product.name} ${result.added === 1 ? "item" : "items"} to your order.`
      : result.reason === "line-limit"
        ? "An order can contain up to 50 different product selections. Remove an item before adding another."
        : `${product.name} is already at its available stock limit.`);
    setAddQuantities((current) => ({ ...current, [product.id]: 1 }));
    if (!uncertainSubmission) placeOrder.reset();
  }

  function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (placeOrder.isPending) return;

    if (uncertainSubmission && pendingSubmission.current?.liveSlug === slug) {
      if (!uncertainConflict) {
        placeOrder.mutate({
          liveId: live.id,
          input: pendingSubmission.current.input,
          idempotencyKey: pendingSubmission.current.key,
        }, {
          onSuccess: handleSubmissionSuccess,
          onError: handleSubmissionError,
        });
      }
      return;
    }

    if (cart.length === 0) {
      setFormError("Add at least one product to your order.");
      return;
    }
    if (invalidStockLine) {
      setFormError("Review your order: a product is no longer available in the selected quantity.");
      return;
    }

    const customerName = contact.customerName.trim();
    const customerPhone = contact.customerPhone.trim();
    const deliveryLocation = contact.deliveryLocation.trim();
    if (customerName.length < 1 || customerName.length > 100) {
      setFormError("Enter your name using 1 to 100 characters.");
      return;
    }
    if (customerPhone.length < 7 || customerPhone.length > 30) {
      setFormError("Enter a phone number using 7 to 30 characters.");
      return;
    }
    if (deliveryLocation.length < 1 || deliveryLocation.length > 300) {
      setFormError("Enter a delivery location using 1 to 300 characters.");
      return;
    }

    const input: CreateCustomerOrderInput = {
      customerName,
      customerPhone,
      deliveryLocation,
      items: cart.map(({ productId, quantity, selectedOptions }) => ({
        productId,
        quantity,
        ...(Object.keys(selectedOptions).length > 0 ? { selectedOptions } : {}),
      })),
    };
    const storedKey = getPublicOrderIdempotencyKey(slug);
    const submission = { liveSlug: slug, key: storedKey, input };
    pendingSubmission.current = submission;
    placeOrder.mutate(
      { liveId: live.id, input, idempotencyKey: storedKey },
      {
        onSuccess: handleSubmissionSuccess,
        onError: handleSubmissionError,
      },
    );
  }

  function handleSubmissionSuccess() {
    clearPublicOrderIdempotencyKey(slug);
    pendingSubmission.current = null;
    setUncertainSubmission(false);
    setCartOpen(false);
  }

  function handleSubmissionError(error: Error) {
    if (error instanceof ApiError && error.code === "IDEMPOTENCY_KEY_REUSED") {
      setUncertainSubmission(true);
      setUncertainConflict(true);
    } else if (error instanceof TransportError || (error instanceof ApiError && error.status >= 500)) {
      setUncertainSubmission(true);
    }
  }

  async function continueShopping() {
    setRefreshingAvailability(true);
    setAvailabilityRefreshFailed(false);
    const refreshResult = await liveQuery.refetch();
    setAvailabilityRefreshFailed(refreshResult.isError);
    placeOrder.reset();
    setCart([]);
    setAddQuantities({});
    setSelections({});
    setContact({ customerName: "", customerPhone: "", deliveryLocation: "" });
    setCartFeedback(null);
    setFormError(null);
    setUncertainSubmission(false);
    setUncertainConflict(false);
    pendingSubmission.current = null;
    setRefreshingAvailability(false);
  }

  if (placeOrder.isSuccess) {
    return <OrderConfirmation live={live} onContinueShopping={continueShopping} order={placeOrder.data} refreshingAvailability={refreshingAvailability} />;
  }

  return (
    <>
      <PageHeader
        description="Choose products, add them to your order, then send your details to the seller."
        eyebrow="LiveOrder storefront"
        title={live.name}
      />
      {availabilityRefreshFailed && <Notice title="Your order was submitted, but availability could not be refreshed. Reload the storefront before placing another order." tone="info" />}
      {live.tiktokLiveUrl && (
        <a className="mb-6 inline-flex text-sm font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 hover:text-brand-900" href={live.tiktokLiveUrl} rel="noopener noreferrer" target="_blank">
          Return to TikTok LIVE
        </a>
      )}
      {live.products.length === 0 ? (
        <Card><CardContent><p className="font-semibold text-ink">Products will appear here when the seller adds them.</p></CardContent></Card>
      ) : (
        <form className="grid gap-6 pb-24 lg:grid-cols-[minmax(0,1fr)_21rem] lg:pb-0" onSubmit={submitOrder}>
          <section aria-label="Products" className="grid content-start gap-4 sm:grid-cols-2">
            {live.products.map((product) => {
              const optionGroups = readProductOptionGroups(product.options);
              const alreadyInCart = productQuantityInCart(cart, product.id);
              const remainingStock = Math.max(0, product.stockQuantity - alreadyInCart);
              const selectedQuantity = Math.min(addQuantities[product.id] ?? 1, remainingStock, 100);
              return (
                <Card key={product.id}>
                  <CardContent className="grid gap-3">
                    <ProductImage src={product.image?.url} name={product.name} />
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="min-w-0 break-words font-bold text-ink">{product.name}</h2>
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
                              disabled={uncertainSubmission}
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
                        <div className="mt-auto grid gap-3 border-t border-border pt-3">
                          <label className="grid max-w-40 gap-1.5 text-sm font-medium text-ink">
                            Quantity to add
                            <input
                              aria-label={`Quantity to add for ${product.name}`}
                              className="min-h-11 rounded-control border border-border px-3 outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                              disabled={uncertainSubmission || remainingStock === 0}
                              max={Math.min(remainingStock, 100)}
                              min={1}
                              onChange={(event) => {
                                const value = event.target.value === "" ? 1 : Number(event.target.value);
                                if (Number.isInteger(value)) setAddQuantities((current) => ({ ...current, [product.id]: Math.min(Math.max(1, value), remainingStock, 100) }));
                              }}
                              step={1}
                              type="number"
                              value={remainingStock === 0 ? 0 : selectedQuantity}
                            />
                          </label>
                          <Button disabled={uncertainSubmission || remainingStock === 0 || selectedQuantity < 1} onClick={() => addToOrder(product)} type="button">
                            {remainingStock === 0 ? "Stock limit reached" : "Add to order"}
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </section>

          {cartOpen && <button aria-label="Close cart" className="fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={() => setCartOpen(false)} type="button" />}
          <aside
            aria-labelledby="public-cart-title"
            aria-modal={cartOpen ? "true" : undefined}
            className={cartOpen
              ? "fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-panel border border-border bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-panel lg:sticky lg:top-5 lg:max-h-none lg:overflow-visible lg:rounded-panel lg:p-5 lg:pb-5 lg:shadow-none"
              : "hidden h-fit rounded-panel border border-border bg-white p-5 lg:sticky lg:top-5 lg:block"}
            ref={cartPanelRef}
            role={cartOpen ? "dialog" : undefined}
            tabIndex={-1}
          >
            <div className="mb-2 flex items-center justify-between gap-3 lg:mb-0">
              <h2 className="text-lg font-bold text-ink" id="public-cart-title">Your order</h2>
          <Button aria-label="Close cart" className="lg:hidden" onClick={() => setCartOpen(false)} ref={cartCloseButtonRef} size="sm" type="button" variant="ghost">Close</Button>
            </div>
            <p className="mt-1 text-sm text-ink-muted">Products stay separate; stock is shared across choices for each product.</p>
            {cartFeedback && <p className="mt-3 text-sm font-medium text-success-700" role="status">{cartFeedback}</p>}
            {cartLines.length === 0 ? (
              <p className="mt-4 text-sm text-ink-muted">Add products to start your order.</p>
            ) : (
              <ul aria-label="Order items" className="mt-4 grid gap-4 border-y border-border py-4">
                {cartLines.map((line) => (
                  <li className="grid gap-2 text-sm" key={`${line.productId}:${JSON.stringify(line.selectedOptions)}:${line.index}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-ink">{line.product?.name ?? "Product no longer available"}</p>
                        <SelectedOptions options={line.selectedOptions} />
                        {line.product && <p className="text-ink-muted">{formatPesewas(line.product.price)} each</p>}
                      </div>
                      <p className="shrink-0 font-semibold tabular-nums text-ink">{line.product ? formatPesewas(line.product.price * line.quantity) : "—"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button aria-label={`Decrease ${line.product?.name ?? "item"} quantity`} disabled={uncertainSubmission} onClick={() => setCart((current) => setCartLineQuantity(current, line.index, line.quantity - 1, line.product?.stockQuantity ?? 0))} size="sm" type="button" variant="secondary">−</Button>
                      <span aria-label={`Quantity ${line.quantity}`} className="min-w-6 text-center font-semibold">{line.quantity}</span>
                      <Button aria-label={`Increase ${line.product?.name ?? "item"} quantity`} disabled={uncertainSubmission || !line.product || productQuantityInCart(cart, line.productId) >= line.product.stockQuantity || line.quantity >= 100} onClick={() => setCart((current) => setCartLineQuantity(current, line.index, line.quantity + 1, line.product?.stockQuantity ?? 0))} size="sm" type="button" variant="secondary">+</Button>
                      <Button aria-label={`Remove ${line.product?.name ?? "item"}`} disabled={uncertainSubmission} onClick={() => setCart((current) => removeCartLine(current, line.index))} size="sm" type="button" variant="ghost">Remove</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 flex justify-between font-bold text-ink"><span>Estimated total</span><span className="tabular-nums">{formatPesewas(cartTotal)}</span></p>
            <p className="mt-1 text-xs text-ink-muted">The server confirms current prices and the final total.</p>
            <div className="mt-5 grid gap-3">
              <label className="grid gap-1.5 text-sm font-medium text-ink">Your name<input autoComplete="name" className="min-h-11 rounded-control border border-border px-3" disabled={uncertainSubmission} maxLength={100} minLength={1} onChange={(event) => updateContact("customerName", event.target.value)} required value={contact.customerName} /></label>
              <label className="grid gap-1.5 text-sm font-medium text-ink">Phone number<input autoComplete="tel" className="min-h-11 rounded-control border border-border px-3" disabled={uncertainSubmission} maxLength={30} minLength={7} onChange={(event) => updateContact("customerPhone", event.target.value)} required type="tel" value={contact.customerPhone} /></label>
              <label className="grid gap-1.5 text-sm font-medium text-ink">Delivery location<input autoComplete="street-address" className="min-h-11 rounded-control border border-border px-3" disabled={uncertainSubmission} maxLength={300} minLength={1} onChange={(event) => updateContact("deliveryLocation", event.target.value)} required value={contact.deliveryLocation} /></label>
              {formError && <p className="text-sm text-danger-700" role="alert">{formError}</p>}
              {placeOrder.isError && <Notice title={orderError} />}
              {invalidStockLine && !placeOrder.isError && <Notice title="Review your order quantities to match current availability." />}
              {uncertainConflict && <p className="text-sm text-ink-muted">Do not submit a new order until you have checked with the seller.</p>}
              {placeOrder.isError && placeOrder.error instanceof ApiError && placeOrder.error.code === "INSUFFICIENT_STOCK" && (
                <Button onClick={() => void liveQuery.refetch()} type="button" variant="secondary">Refresh availability</Button>
              )}
              <Button disabled={placeOrder.isPending || cart.length === 0 || Boolean(invalidStockLine) || uncertainConflict} type="submit">
                {placeOrder.isPending ? "Sending order…" : uncertainSubmission ? "Retry same order" : "Place order"}
              </Button>
            </div>
          </aside>
        </form>
      )}
      {cart.length > 0 && !cartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 px-4 pt-3 shadow-panel backdrop-blur lg:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          <div className="mx-auto flex max-w-screen-sm items-center justify-between gap-3">
            <div aria-live="polite" className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{cartQuantity} {cartQuantity === 1 ? "item" : "items"}</p>
              <p className="text-xs text-ink-muted">Subtotal · {formatPesewas(cartTotal)}</p>
            </div>
            <Button onClick={() => setCartOpen(true)} ref={cartTriggerRef} type="button">View cart</Button>
          </div>
        </div>
      )}
    </>
  );
}

function OrderConfirmation({ live, order, onContinueShopping, refreshingAvailability }: { live: PublicLive; order: CreatedCustomerOrder; onContinueShopping(): void; refreshingAvailability: boolean }) {
  return (
    <>
      <PageHeader description={`Your order has been submitted to ${live.name}'s seller.`} eyebrow="Order submitted" title="Thanks for your order" />
      <Card>
        <CardContent className="grid gap-5">
          <div className="rounded-control bg-success-50 p-4">
            <p className="font-bold text-success-800">Order received</p>
            <p className="mt-1 text-sm text-success-800">Payment has not been confirmed. The seller will follow up with you.</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-muted">Order reference</p>
            <p className="mt-1 font-mono text-xl font-bold tracking-wide text-ink">{order.reference}</p>
          </div>
          <div>
            <h2 className="font-bold text-ink">Items ordered</h2>
            <ul className="mt-3 grid gap-3 border-y border-border py-3">
              {order.items.map((item) => (
                <li className="flex justify-between gap-4 text-sm" key={item.id}>
                  <span>
                    <span className="font-semibold text-ink">{item.productName} × {item.quantity}</span>
                    <SelectedOptions options={item.selectedOptions} />
                    <span className="block text-ink-muted">{formatPesewas(item.unitPrice)} each</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums text-ink">{formatPesewas(item.unitPrice * item.quantity)}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="flex justify-between text-lg font-bold text-ink"><span>Order total</span><span className="tabular-nums">{formatPesewas(order.totalAmount)}</span></p>
          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row">
            <Button disabled={refreshingAvailability} onClick={onContinueShopping} type="button">{refreshingAvailability ? "Refreshing availability…" : "Continue shopping"}</Button>
            {live.tiktokLiveUrl && <a className={buttonClassName("secondary")} href={live.tiktokLiveUrl} rel="noopener noreferrer" target="_blank">Return to TikTok LIVE</a>}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

function SelectedOptions({ options }: { options: unknown }) {
  if (typeof options !== "object" || options === null || Array.isArray(options)) return null;
  const entries = Object.entries(options).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  if (entries.length === 0) return null;
  return <span className="block text-xs text-ink-muted">{entries.map(([group, choice]) => `${group}: ${choice}`).join(" · ")}</span>;
}

function ProductImage({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return src && !failed ? (
    <img alt={name} className="aspect-4/3 w-full rounded-panel bg-canvas object-contain" loading="lazy" onError={() => setFailed(true)} src={src} />
  ) : (
    <div className="grid aspect-4/3 place-items-center rounded-panel bg-canvas text-sm text-ink-muted">Image unavailable</div>
  );
}
