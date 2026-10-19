import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { EmptyState, LoadingState, Notice, RequestFailure } from "../../../components/feedback/feedback";
import { PageHeader } from "../../../components/layout/page-header";
import { Button } from "../../../components/ui/button";
import { ConfirmationDialog } from "../../../components/ui/confirmation-dialog";
import { TextField } from "../../../components/ui/text-field";
import { ApiError } from "../../../lib/api-client";
import { parseCedisToPesewas, pesewasToCedisInput } from "../../../lib/product-price";
import { parseProductOptions, readProductOptionGroups, type ProductOptionGroup } from "../../../lib/product-options";
import { useLives } from "../../lives/hooks/use-lives";
import type { Product } from "../api/products-api";
import { ProductOptionsEditor } from "../components/product-options-editor";
import {
  useCreateProduct,
  useProducts,
  useRemoveProductImage,
  useUpdateProduct,
  useUploadProductImage,
} from "../hooks/use-products";

export function ProductFormPage() {
  const { liveId = "", productId } = useParams();
  const lives = useLives();
  const products = useProducts(liveId, { enabled: Boolean(productId) });

  if (lives.isPending || lives.isFetching || (productId && (products.isPending || products.isFetching))) {
    return <LoadingState label={productId ? "Loading product…" : "Loading this Live…"} />;
  }
  if (lives.isError) return <RequestFailure label="We couldn't load this Live." onRetry={() => void lives.refetch()} />;
  if (productId && products.isError) return <RequestFailure label="We couldn't load this Live's products." onRetry={() => void products.refetch()} />;

  const live = lives.data.find((item) => item.id === liveId);
  if (!live) {
    return <EmptyState action={<Link className="font-semibold text-brand-700 underline" to="/lives">All Lives</Link>} description="This Live may have been removed or may not belong to your account." title="Live not found" />;
  }

  const product = productId ? products.data?.find((item) => item.id === productId && item.liveId === liveId) : undefined;
  if (productId && !product) {
    return <EmptyState action={<Link className="font-semibold text-brand-700 underline" to={`/lives/${liveId}/products`}>Back to products</Link>} description="The product may have been removed or may not belong to this Live." title="Product not found" />;
  }

  return <ProductEditor key={`${liveId}:${product?.id ?? "new"}`} liveId={liveId} liveName={live.name} product={product} />;
}

function ProductEditor({ liveId, liveName, product }: { liveId: string; liveName: string; product?: Product }) {
  const navigate = useNavigate();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const uploadImage = useUploadProductImage();
  const removeImage = useRemoveProductImage();
  const existingOptions = readProductOptionGroups(product?.options);
  const [name, setName] = useState(product?.name ?? "");
  const [price, setPrice] = useState(product ? pesewasToCedisInput(product.price) : "");
  const [stockQuantity, setStockQuantity] = useState(String(product?.stockQuantity ?? 0));
  const [groups, setGroups] = useState<ProductOptionGroup[]>(() => existingOptions.supported ? existingOptions.groups : []);
  const [optionsChanged, setOptionsChanged] = useState(false);
  const [replaceLegacyOptions, setReplaceLegacyOptions] = useState(false);
  const [clearOptions, setClearOptions] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [confirmRemoveImage, setConfirmRemoveImage] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; price?: string; stock?: string; options?: string }>({});
  const isPending = createProduct.isPending || updateProduct.isPending;
  const mutationError = createProduct.error ?? updateProduct.error;
  const previewUrl = useMemo(
    () => imageFile ? URL.createObjectURL(imageFile) : product?.image?.url,
    [imageFile, product?.image?.url],
  );
  const imageFileError = imageFile && !["image/jpeg", "image/png", "image/webp"].includes(imageFile.type)
    ? "Choose a JPEG, PNG, or WebP image."
    : imageFile && imageFile.size > 5 * 1024 * 1024
      ? "Product images must be 5 MB or smaller."
      : null;

  useEffect(() => {
    if (!imageFile) return;
    const objectUrl = previewUrl;
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageFile, previewUrl]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    const normalizedName = name.trim();
    if (normalizedName.length < 1 || normalizedName.length > 100) nextErrors.name = "Enter a product name of 1 to 100 characters.";
    const parsedPrice = parseCedisToPesewas(price);
    if (!parsedPrice.ok) nextErrors.price = parsedPrice.message;

    const stockText = stockQuantity.trim();
    const parsedStock = /^(0|[1-9]\d*)$/.test(stockText) ? Number(stockText) : Number.NaN;
    if (!Number.isSafeInteger(parsedStock) || parsedStock < 0 || parsedStock > 2_147_483_647) {
      nextErrors.stock = "Enter a whole stock quantity from 0 to 2,147,483,647.";
    }

    const shouldSubmitOptions = !product || optionsChanged || replaceLegacyOptions || clearOptions;
    const parsedOptions = shouldSubmitOptions && !clearOptions ? parseProductOptions(groups) : undefined;
    if (parsedOptions && !parsedOptions.ok) nextErrors.options = parsedOptions.message;

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !parsedPrice.ok || !Number.isSafeInteger(parsedStock)) return;

    if (!product) {
      createProduct.mutate(
        {
          liveId,
          input: {
            name: normalizedName,
            price: parsedPrice.value,
            stockQuantity: parsedStock,
            ...(parsedOptions?.ok && Object.keys(parsedOptions.value).length > 0 ? { options: parsedOptions.value } : {}),
          },
        },
        { onSuccess: () => navigate(`/lives/${liveId}/products`, { state: { productNotice: "created" } }) },
      );
      return;
    }

    updateProduct.mutate(
      {
        liveId,
        productId: product.id,
        input: {
          name: normalizedName,
          price: parsedPrice.value,
          stockQuantity: parsedStock,
          ...(clearOptions ? { options: null } : optionsChanged || replaceLegacyOptions
            ? { options: parsedOptions?.ok && Object.keys(parsedOptions.value).length > 0 ? parsedOptions.value : null }
            : {}),
        },
      },
      { onSuccess: () => navigate(`/lives/${liveId}/products`, { state: { productNotice: "updated" } }) },
    );
  }

  const mutationErrorMessage = mutationError instanceof ApiError && mutationError.code === "VALIDATION_ERROR"
    ? "The server rejected one or more product fields. Check the name, price, stock and options, then try again."
    : mutationError instanceof ApiError && mutationError.status === 404
      ? product ? "This product or Live is no longer available. Return to the product list and refresh." : "This Live is no longer available in your account."
      : "We couldn't save this product. Your current product information is unchanged; please try again.";
  const imageError = uploadImage.error ?? removeImage.error;
  const imageErrorMessage = imageError instanceof ApiError && imageError.code === "IMAGE_STORAGE_NOT_CONFIGURED"
    ? "Image uploads are not configured yet. Ask the administrator to add the Cloudinary server credentials."
    : imageError instanceof ApiError && imageError.code === "INVALID_IMAGE_FORMAT"
      ? "Choose a valid JPEG, PNG, or WebP image no larger than 5 MB."
      : "We couldn't update this image. The saved product image has not been changed.";

  return (
    <>
      <Link className="mb-5 inline-flex text-sm font-semibold text-brand-700 hover:text-brand-900" to={`/lives/${liveId}/products`}>← Back to products</Link>
      <PageHeader description={`${product ? "Update product details for" : "Add a product to"} ${liveName}.`} eyebrow="Live workspace" title={product ? "Edit product" : "Add product"} />
      {(createProduct.isError || updateProduct.isError) && <div className="mb-5"><Notice title={mutationErrorMessage} /></div>}

      <form className="max-w-2xl space-y-5" noValidate onSubmit={submit}>
        <TextField autoComplete="off" disabled={isPending} error={errors.name} label="Product name" maxLength={100} onChange={(event) => setName(event.target.value)} required value={name} />
        <TextField disabled={isPending} error={errors.price} hint="Enter the amount in Ghanaian cedis, for example 25.50." inputMode="decimal" label="Price (GHS)" onChange={(event) => setPrice(event.target.value)} placeholder="0.00" required value={price} />
        <TextField disabled={isPending} error={errors.stock} hint="This is the quantity available to order. Option choices do not have separate stock." inputMode="numeric" label="Stock quantity" min={0} onChange={(event) => setStockQuantity(event.target.value)} required step={1} type="number" value={stockQuantity} />

        {product && !existingOptions.supported && !replaceLegacyOptions && (
          <Notice title="This product has options in an older format." tone="info">
            They will be preserved until you choose to replace them with editable option groups.
          </Notice>
        )}
        {product && !existingOptions.supported && !replaceLegacyOptions ? (
          <Button onClick={() => { setReplaceLegacyOptions(true); setOptionsChanged(true); }} type="button" variant="secondary">Replace legacy options</Button>
        ) : (
          <>
            <ProductOptionsEditor
              disabled={isPending || clearOptions}
              groups={groups}
              onChange={(nextGroups) => { setGroups(nextGroups); setOptionsChanged(true); setClearOptions(false); }}
            />
            {errors.options && <p className="text-sm text-danger-700" role="alert">{errors.options}</p>}
            {product && (
              <Button
                disabled={isPending}
                onClick={() => {
                  setClearOptions((current) => !current);
                  setOptionsChanged(true);
                  setErrors((current) => ({ ...current, options: undefined }));
                }}
                size="sm"
                type="button"
                variant={clearOptions ? "danger" : "secondary"}
              >
                {clearOptions ? "Undo clearing options" : "Clear options"}
              </Button>
            )}
          </>
        )}

        {product && (
          <section className="grid gap-3 border-t border-border pt-5" aria-labelledby="product-image-heading">
            <h2 className="text-base font-bold text-ink" id="product-image-heading">Product image</h2>
            <p className="text-sm text-ink-muted">JPEG, PNG, or WebP, up to 5 MB. Uploading replaces the current image.</p>
            {previewUrl ? <img alt={`${product.name} product preview`} className="max-h-64 w-full rounded-panel bg-canvas object-contain" src={previewUrl} /> : <div className="grid aspect-4/3 max-w-sm place-items-center rounded-panel bg-canvas text-sm text-ink-muted">No product image yet</div>}
            {uploadImage.isError || removeImage.isError ? <Notice title={imageErrorMessage} /> : null}
            {uploadImage.isSuccess || removeImage.isSuccess ? <Notice title="Product image updated." tone="success" /> : null}
            <label className="grid max-w-md gap-2 text-sm font-semibold text-ink">
              Choose an image
              <input accept="image/jpeg,image/png,image/webp" disabled={uploadImage.isPending || removeImage.isPending} onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} type="file" />
            </label>
            {imageFileError && <p className="text-sm text-danger-700" role="alert">{imageFileError}</p>}
            <div className="flex flex-wrap gap-2">
              <Button disabled={!imageFile || Boolean(imageFileError) || uploadImage.isPending || removeImage.isPending} onClick={() => {
                if (imageFile) uploadImage.mutate({ liveId, productId: product.id, file: imageFile }, { onSuccess: () => setImageFile(null) });
              }} type="button">
                {uploadImage.isPending ? "Uploading…" : product.image ? "Replace image" : "Upload image"}
              </Button>
              {product.image && <Button disabled={uploadImage.isPending || removeImage.isPending} onClick={() => setConfirmRemoveImage(true)} type="button" variant="danger">Remove image</Button>}
            </div>
          </section>
        )}

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <Link className="inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-white px-4 text-sm font-semibold text-ink hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2" to={`/lives/${liveId}/products`}>Cancel</Link>
          <Button disabled={isPending} type="submit">{isPending ? "Saving…" : product ? "Save changes" : "Create product"}</Button>
        </div>
      </form>

      <ConfirmationDialog
        cancelLabel="Keep image"
        confirmLabel="Remove image"
        description={`The image for “${product?.name ?? "this product"}” will be removed from customer pages.`}
        isPending={removeImage.isPending}
        onCancel={() => setConfirmRemoveImage(false)}
        onConfirm={() => {
          if (product) removeImage.mutate({ liveId, productId: product.id }, { onSuccess: () => setConfirmRemoveImage(false) });
        }}
        open={confirmRemoveImage}
        title="Remove this image?"
      />
    </>
  );
}
