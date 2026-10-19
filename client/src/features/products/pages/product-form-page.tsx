import { useState, type FormEvent } from "react";
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
import { ProductImageField } from "../components/product-image-field";
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
  const [createdProductId, setCreatedProductId] = useState<string | null>(null);
  const [confirmRemoveImage, setConfirmRemoveImage] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; price?: string; stock?: string; options?: string }>({});
  const isPending = createProduct.isPending || updateProduct.isPending || uploadImage.isPending;
  const mutationError = createProduct.error ?? updateProduct.error;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createdProductId || createProduct.isPending || uploadImage.isPending) return;
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
    if (Object.keys(nextErrors).length > 0 || !parsedPrice.ok || !Number.isSafeInteger(parsedStock) ||
      (imageFile && (!["image/jpeg", "image/png", "image/webp"].includes(imageFile.type) || imageFile.size > 5 * 1024 * 1024))) return;

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
        {
          onSuccess: (createdProduct) => {
            if (!imageFile) {
              navigate(`/lives/${liveId}/products`, { state: { productNotice: "created" } });
              return;
            }

            setCreatedProductId(createdProduct.id);
            uploadImage.mutate(
              { liveId, productId: createdProduct.id, file: imageFile },
              { onSuccess: () => navigate(`/lives/${liveId}/products`, { state: { productNotice: "created" } }) },
            );
          },
        },
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

      {createdProductId && uploadImage.isError && (
        <div className="mb-5">
          <Notice title="Product saved, but its image could not be uploaded.">
            Your product is already in the Live. Retry the image upload below or continue to the product list; this will not create another product.
          </Notice>
        </div>
      )}

      <form className="max-w-2xl space-y-5" noValidate onSubmit={submit}>
        <TextField autoComplete="off" disabled={isPending || Boolean(createdProductId)} error={errors.name} label="Product name" maxLength={100} onChange={(event) => setName(event.target.value)} required value={name} />
        <TextField disabled={isPending || Boolean(createdProductId)} error={errors.price} hint="Enter the amount in Ghanaian cedis, for example 25.50." inputMode="decimal" label="Price (GHS)" onChange={(event) => setPrice(event.target.value)} placeholder="0.00" required value={price} />
        <TextField disabled={isPending || Boolean(createdProductId)} error={errors.stock} hint="This is the quantity available to order. Option choices do not have separate stock." inputMode="numeric" label="Stock quantity" min={0} onChange={(event) => setStockQuantity(event.target.value)} required step={1} type="number" value={stockQuantity} />

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
              disabled={isPending || Boolean(createdProductId) || clearOptions}
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

        <ProductImageField
          currentImageUrl={product?.image?.url}
          disabled={isPending}
          file={imageFile}
          onFileChange={setImageFile}
          onRemove={product?.image ? () => setConfirmRemoveImage(true) : undefined}
          onUpload={product
            ? () => {
              if (imageFile) uploadImage.mutate({ liveId, productId: product.id, file: imageFile }, { onSuccess: () => setImageFile(null) });
            }
            : createdProductId
              ? () => {
                if (imageFile) uploadImage.mutate(
                  { liveId, productId: createdProductId, file: imageFile },
                  { onSuccess: () => navigate(`/lives/${liveId}/products`, { state: { productNotice: "created" } }) },
                );
              }
              : undefined}
          pending={uploadImage.isPending}
          productName={(product?.name ?? name.trim()) || "New product"}
          removePending={removeImage.isPending}
          uploadLabel={createdProductId ? "Retry image upload" : product?.image ? "Replace image" : "Upload image"}
        />
        {(uploadImage.isError && !createdProductId) || removeImage.isError ? <Notice title={imageErrorMessage} /> : null}
        {product && (uploadImage.isSuccess || removeImage.isSuccess) ? <Notice title="Product image updated." tone="success" /> : null}

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <Link className="inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-white px-4 text-sm font-semibold text-ink hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2" to={`/lives/${liveId}/products`}>Cancel</Link>
          {createdProductId ? (
            <Link className="inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-white px-4 text-sm font-semibold text-ink hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2" to={`/lives/${liveId}/products`}>Continue to products</Link>
          ) : (
            <Button disabled={isPending} type="submit">{isPending ? "Saving…" : product ? "Save changes" : "Create product"}</Button>
          )}
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
