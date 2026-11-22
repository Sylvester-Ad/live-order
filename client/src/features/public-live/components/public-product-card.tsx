import { useState } from "react";

import { formatPesewas } from "../../../lib/format-money";
import type { PublicStorefront } from "../api/public-live-api";
import { PublicProductDetailsDialog } from "./public-product-details-dialog";

type PublicProduct = PublicStorefront["products"][number];

export function PublicProductCard({
  product,
  quantityInOrder,
  quantity,
  selectedOptions,
  disabled,
  onQuantityChange,
  onOptionChange,
  onAdd,
}: {
  product: PublicProduct;
  quantityInOrder: number;
  quantity: number;
  selectedOptions: Record<string, string>;
  disabled: boolean;
  onQuantityChange: (quantity: number) => void;
  onOptionChange: (groupName: string, value: string) => void;
  onAdd: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const images = product.images ?? (product.image ? [{ ...product.image, isPrimary: true }] : []);
  const primaryImage = images.find((image) => image.isPrimary) ?? images[0];
  const isAvailable = product.available && product.stockQuantity > 0;

  return (
    <article className="overflow-hidden rounded-panel border border-border bg-white shadow-card transition-shadow hover:shadow-panel">
      <button
        aria-label={`See photos and details for ${product.name}`}
        className="group relative block w-full overflow-hidden bg-canvas text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-600"
        onClick={() => setDetailsOpen(true)}
        type="button"
      >
        {primaryImage && !imageFailed ? (
          <img
            alt={product.name}
            className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
            onError={() => setImageFailed(true)}
            src={primaryImage.url}
          />
        ) : (
          <div className="grid aspect-[4/3] place-items-center bg-gradient-to-br from-brand-50 via-canvas to-brand-100 px-4 text-center">
            <span className="rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-ink-muted">
              {primaryImage ? "Image unavailable" : "Photo coming soon"}
            </span>
          </div>
        )}
        {images.length > 1 && (
          <span className="absolute bottom-3 right-3 rounded-full bg-ink/75 px-2.5 py-1 text-xs font-semibold text-white">
            {images.length} photos
          </span>
        )}
        {quantityInOrder > 0 && (
          <span className="absolute left-3 top-3 rounded-full bg-brand-700 px-2.5 py-1 text-xs font-semibold text-white">
            {quantityInOrder} in your order
          </span>
        )}
      </button>

      <div className="grid gap-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 break-words text-base font-bold leading-snug text-ink sm:text-lg">{product.name}</h2>
          <p className="shrink-0 text-base font-bold tabular-nums text-brand-800">{formatPesewas(product.price)}</p>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className={`text-sm font-medium ${isAvailable ? "text-ink-muted" : "text-danger-700"}`}>
            {isAvailable ? `${product.stockQuantity} available` : "Out of stock"}
          </p>
          <button
            aria-label={`View ${product.name} details`}
            className="min-h-10 shrink-0 rounded-control border border-brand-700 px-3 text-sm font-semibold text-brand-800 transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            onClick={() => setDetailsOpen(true)}
            type="button"
          >
            View details
          </button>
        </div>
      </div>
      {detailsOpen && (
        <PublicProductDetailsDialog
          disabled={disabled}
          onAdd={() => {
            onAdd();
            setDetailsOpen(false);
          }}
          onClose={() => setDetailsOpen(false)}
          onOptionChange={onOptionChange}
          onQuantityChange={onQuantityChange}
          open={detailsOpen}
          product={product}
          quantity={quantity}
          quantityInOrder={quantityInOrder}
          selectedOptions={selectedOptions}
        />
      )}
    </article>
  );
}
