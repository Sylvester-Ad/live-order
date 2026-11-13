import type { ProductImage } from "../api/products-api";

type Props = {
  images: ProductImage[];
  productName: string;
  selectingImageId?: string | null;
  removingImageId?: string | null;
  actionsDisabled?: boolean;
  onMakePrimary?(imageId: string): void;
  onRemoveImage?(image: ProductImage): void;
};

export function ProductImageGallery({
  images,
  productName,
  selectingImageId = null,
  removingImageId = null,
  actionsDisabled = false,
  onMakePrimary,
  onRemoveImage,
}: Props) {
  const primaryImage = images.find((image) => image.isPrimary);

  return (
    <section aria-labelledby="product-gallery-heading" className="grid gap-3 border-t border-border pt-5">
      <h2 className="text-base font-bold text-ink" id="product-gallery-heading">Product image gallery</h2>
      {images.length === 0 ? (
        <p className="text-sm text-ink-muted">No product images yet.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((image, index) => (
            <li className="grid content-start gap-2" key={image.id}>
              <img
                alt={`${productName} image ${index + 1}`}
                className="aspect-square w-full rounded-panel bg-canvas object-contain"
                src={image.url}
              />
              {image.isPrimary && (
                <span className="w-fit rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-800">
                  Primary
                </span>
              )}
              {(onMakePrimary || onRemoveImage) && (
                <div className="flex flex-wrap gap-2">
                  {onMakePrimary && !image.isPrimary && (
                    <button
                      className="min-h-9 rounded-control border border-border px-3 text-sm font-semibold text-ink hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={actionsDisabled || selectingImageId !== null || removingImageId !== null}
                      onClick={() => onMakePrimary(image.id)}
                      type="button"
                    >
                      {selectingImageId === image.id ? "Making primary…" : "Make primary"}
                    </button>
                  )}
                  {onRemoveImage && (
                    <button
                      className="min-h-9 rounded-control border border-danger-300 px-3 text-sm font-semibold text-danger-700 hover:bg-danger-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-600 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={actionsDisabled || selectingImageId !== null || removingImageId !== null}
                      onClick={() => onRemoveImage(image)}
                      type="button"
                    >
                      {removingImageId === image.id ? "Removing…" : "Remove image"}
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {images.length > 0 && !primaryImage && (
        <p className="text-sm text-ink-muted">No primary image is selected.</p>
      )}
    </section>
  );
}
