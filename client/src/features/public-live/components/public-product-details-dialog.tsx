import { useEffect, useRef, useState, type SyntheticEvent } from "react";

import { Button } from "../../../components/ui/button";
import { formatPesewas } from "../../../lib/format-money";
import { readProductOptionGroups } from "../../../lib/product-options";
import type { PublicStorefront } from "../api/public-live-api";

type PublicProduct = PublicStorefront["products"][number];

export function PublicProductDetailsDialog({
  product,
  open,
  quantity,
  quantityInOrder,
  selectedOptions,
  disabled,
  onClose,
  onQuantityChange,
  onOptionChange,
  onAdd,
}: {
  product: PublicProduct | null;
  open: boolean;
  quantity: number;
  quantityInOrder: number;
  selectedOptions: Record<string, string>;
  disabled: boolean;
  onClose: () => void;
  onQuantityChange: (quantity: number) => void;
  onOptionChange: (groupName: string, value: string) => void;
  onAdd: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      closeButtonRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }

    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    onClose();
  }

  if (!product) return null;

  const productImages = product.images ?? (product.image ? [{ ...product.image, isPrimary: true }] : []);
  const optionGroups = readProductOptionGroups(product.options);
  const missingPreference = optionGroups.supported && optionGroups.groups.some(
    (group) => !group.choices.includes(selectedOptions[group.name] ?? ""),
  );
  const remainingStock = Math.max(0, product.stockQuantity - quantityInOrder);
  const selectedQuantity = Math.min(quantity, remainingStock, 100);
  const isAvailable = product.available && remainingStock > 0;

  return (
    <dialog
      aria-labelledby="public-product-details-title"
      aria-modal="true"
      className="m-auto max-h-[92dvh] w-[min(100%-1rem,56rem)] overflow-hidden rounded-panel border border-border bg-white p-0 text-ink shadow-[0_24px_80px_rgb(15_37_31_/_28%)] backdrop:bg-ink/55"
      onCancel={handleCancel}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      ref={dialogRef}
      role="dialog"
    >
      <div className="flex max-h-[92dvh] flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-6">
          <p className="text-sm font-semibold text-ink-muted">Product details</p>
          <Button onClick={onClose} ref={closeButtonRef} size="sm" type="button" variant="ghost">Close</Button>
        </div>
        <div className="overflow-y-auto overscroll-contain p-4 sm:p-6">
          <div className="grid gap-5 md:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)] md:gap-8">
            <ProductImageGallery images={productImages} name={product.name} />
            <div className="grid content-start gap-4">
              <div>
                <h2 className="break-words text-2xl font-bold leading-tight tracking-tight text-ink" id="public-product-details-title">
                  {product.name}
                </h2>
                <p className="mt-2 text-xl font-bold tabular-nums text-brand-800">{formatPesewas(product.price)}</p>
                <p className={`mt-2 text-sm font-medium ${isAvailable ? "text-ink-muted" : "text-danger-700"}`}>
                  {isAvailable
                    ? `${remainingStock} available${quantityInOrder > 0 ? ` · ${quantityInOrder} already in your order` : ""}`
                    : "Out of stock"}
                </p>
              </div>

              {optionGroups.supported && optionGroups.groups.length > 0 && (
                <div className="grid gap-3 border-y border-border py-4">
                  <p className="text-sm font-semibold text-ink">Choose your preferences</p>
                  {optionGroups.groups.map((group) => (
                    <label className="grid gap-1.5 text-sm font-medium text-ink" key={`${product.id}:${group.id}`}>
                      <span>{group.name} <span aria-hidden="true" className="text-danger-700">*</span></span>
                      <select
                        aria-label={`Choose ${group.name} for ${product.name}`}
                        aria-required="true"
                        className="min-h-11 rounded-control border border-border bg-white px-3 outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:bg-canvas"
                        disabled={disabled || !isAvailable}
                        onChange={(event) => onOptionChange(group.name, event.target.value)}
                        value={selectedOptions[group.name] ?? ""}
                      >
                        <option value="">Choose an option</option>
                        {group.choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
                      </select>
                    </label>
                  ))}
                  {missingPreference && <p className="text-sm text-ink-muted">Choose every preference before adding this product.</p>}
                </div>
              )}
              {!optionGroups.supported && product.options != null && (
                <p className="rounded-control bg-canvas p-3 text-sm leading-6 text-ink-muted">
                  This product has older option details. Contact the seller to confirm your preference.
                </p>
              )}

              {isAvailable && (
                <div className="grid gap-3">
                  <label className="grid max-w-32 gap-1.5 text-sm font-medium text-ink">
                    Quantity
                    <input
                      aria-label={`Quantity to add for ${product.name}`}
                      className="min-h-11 rounded-control border border-border px-3 outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:bg-canvas"
                      disabled={disabled}
                      max={Math.min(remainingStock, 100)}
                      min={1}
                      onChange={(event) => {
                        const value = event.target.value === "" ? 1 : Number(event.target.value);
                        if (Number.isInteger(value)) {
                          onQuantityChange(Math.min(Math.max(1, value), remainingStock, 100));
                        }
                      }}
                      step={1}
                      type="number"
                      value={selectedQuantity}
                    />
                  </label>
                  <Button
                    className="w-full sm:w-auto"
                    disabled={disabled || selectedQuantity < 1 || missingPreference}
                    onClick={onAdd}
                    type="button"
                  >
                    {missingPreference ? "Choose preferences" : "Add to order"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}

function ProductImageGallery({
  images,
  name,
}: {
  images: PublicProduct["images"];
  name: string;
}) {
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [failedImageIds, setFailedImageIds] = useState<string[]>([]);
  const primaryImage = images.find((image) => image.isPrimary) ?? images[0];
  const selectedImage = images.find((image) => image.id === selectedImageId) ?? primaryImage;
  const selectedImageIndex = selectedImage ? images.findIndex((image) => image.id === selectedImage.id) : -1;

  return (
    <div className="grid content-start gap-3">
      {selectedImage && !failedImageIds.includes(selectedImage.id) ? (
        <img
          alt={`${name} image ${selectedImageIndex + 1}`}
          className="aspect-square w-full rounded-panel bg-canvas object-contain sm:aspect-[4/3]"
          onError={() => setFailedImageIds((current) => [...current, selectedImage.id])}
          src={selectedImage.url}
        />
      ) : (
        <div className="grid aspect-square place-items-center rounded-panel bg-gradient-to-br from-brand-50 via-canvas to-brand-100 px-4 text-center text-sm text-ink-muted sm:aspect-[4/3]">
          {selectedImage ? "Image unavailable" : "No product image"}
        </div>
      )}
      {images.length > 1 && (
        <div aria-label={`${name} product images`} className="flex gap-2 overflow-x-auto pb-1" role="group">
          {images.map((image, index) => (
            <button
              aria-label={`Show image ${index + 1} of ${images.length} for ${name}`}
              aria-pressed={selectedImage?.id === image.id}
              className={`shrink-0 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 ${
                selectedImage?.id === image.id ? "ring-2 ring-brand-700" : "ring-1 ring-border"
              }`}
              key={image.id}
              onClick={() => setSelectedImageId(image.id)}
              type="button"
            >
              <img alt="" className="size-14 rounded-control bg-canvas object-cover sm:size-16" loading="lazy" src={image.url} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
