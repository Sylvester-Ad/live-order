import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { EmptyState, LoadingState, Notice, RequestFailure } from "../../../components/feedback/feedback";
import { PageHeader } from "../../../components/layout/page-header";
import { Button } from "../../../components/ui/button";
import { TextField } from "../../../components/ui/text-field";
import { ApiError } from "../../../lib/api-client";
import { parseCedisToPesewas, pesewasToCedisInput } from "../../../lib/product-price";
import { parseProductOptions } from "../../../lib/product-options";
import { useLives } from "../../lives/hooks/use-lives";
import type { Product } from "../api/products-api";
import { useCreateProduct, useProducts, useUpdateProduct } from "../hooks/use-products";

export function ProductFormPage() {
  const { liveId = "", productId } = useParams();
  const lives = useLives();
  const products = useProducts(liveId, { enabled: Boolean(productId) });

  if (
    lives.isPending ||
    lives.isFetching ||
    (productId && (products.isPending || products.isFetching))
  ) {
    return <LoadingState label={productId ? "Loading product…" : "Loading this Live…"} />;
  }
  if (lives.isError) {
    return <RequestFailure label="We couldn't load this Live." onRetry={() => void lives.refetch()} />;
  }
  if (productId && products.isError) {
    return <RequestFailure label="We couldn't load this Live's products." onRetry={() => void products.refetch()} />;
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

  const product = productId
    ? products.data?.find((item) => item.id === productId && item.liveId === liveId)
    : undefined;
  if (productId && !product) {
    return (
      <EmptyState
        action={<Link className="font-semibold text-brand-700 underline" to={`/lives/${liveId}/products`}>Back to products</Link>}
        description="The product may have been removed or may not belong to this Live."
        title="Product not found"
      />
    );
  }

  return <ProductEditor key={`${liveId}:${product?.id ?? "new"}`} liveId={liveId} liveName={live.name} product={product} />;
}

function ProductEditor({ liveId, liveName, product }: { liveId: string; liveName: string; product?: Product }) {
  const navigate = useNavigate();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const initialOptionsText = productOptionsText(product?.options);
  const [name, setName] = useState(product?.name ?? "");
  const [price, setPrice] = useState(product ? pesewasToCedisInput(product.price) : "");
  const [optionsText, setOptionsText] = useState(initialOptionsText);
  const [optionsChanged, setOptionsChanged] = useState(false);
  const [clearOptions, setClearOptions] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; price?: string; options?: string }>({});
  const isPending = createProduct.isPending || updateProduct.isPending;
  const mutationError = createProduct.error ?? updateProduct.error;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    const normalizedName = name.trim();
    if (normalizedName.length < 1 || normalizedName.length > 100) {
      nextErrors.name = "Enter a product name of 1 to 100 characters.";
    }
    const parsedPrice = parseCedisToPesewas(price);
    if (!parsedPrice.ok) nextErrors.price = parsedPrice.message;

    let parsedOptions: ReturnType<typeof parseProductOptions> | undefined;
    if ((!product && optionsText.trim()) || (product && optionsChanged && !clearOptions)) {
      parsedOptions = parseProductOptions(optionsText);
      if (!parsedOptions.ok) nextErrors.options = parsedOptions.message;
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !parsedPrice.ok) return;

    if (!product) {
      const input = {
        name: normalizedName,
        price: parsedPrice.value,
        ...(parsedOptions?.ok ? { options: parsedOptions.value } : {}),
      };
      createProduct.mutate(
        { liveId, input },
        { onSuccess: () => navigate(`/lives/${liveId}/products`, { state: { productNotice: "created" } }) },
      );
      return;
    }

    const input = {
      name: normalizedName,
      price: parsedPrice.value,
      ...(clearOptions ? { options: null } : optionsChanged && parsedOptions?.ok ? { options: parsedOptions.value } : {}),
    };
    updateProduct.mutate(
      { liveId, productId: product.id, input },
      { onSuccess: () => navigate(`/lives/${liveId}/products`, { state: { productNotice: "updated" } }) },
    );
  }

  const mutationErrorMessage = mutationError instanceof ApiError && mutationError.code === "VALIDATION_ERROR"
    ? "The server rejected one or more product fields. Check the name, price, and options, then try again."
    : mutationError instanceof ApiError && mutationError.status === 404
      ? product
        ? "This product or Live is no longer available. Return to the product list and refresh."
        : "This Live is no longer available in your account."
      : "We couldn't save this product. Your current product information is unchanged; please try again.";

  return (
    <>
      <Link className="mb-5 inline-flex text-sm font-semibold text-brand-700 hover:text-brand-900" to={`/lives/${liveId}/products`}>
        ← Back to products
      </Link>
      <PageHeader
        description={`${product ? "Update product details for" : "Add a product to"} ${liveName}.`}
        eyebrow="Live workspace"
        title={product ? "Edit product" : "Add product"}
      />

      {(createProduct.isError || updateProduct.isError) && <div className="mb-5"><Notice title={mutationErrorMessage} /></div>}

      <form className="max-w-2xl space-y-5" noValidate onSubmit={submit}>
        <TextField
          autoComplete="off"
          disabled={isPending}
          error={errors.name}
          label="Product name"
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />
        <TextField
          disabled={isPending}
          error={errors.price}
          hint="Enter the amount in Ghanaian cedis, for example 25.50."
          inputMode="decimal"
          label="Price (GHS)"
          onChange={(event) => setPrice(event.target.value)}
          placeholder="0.00"
          required
          value={price}
        />

        <div className="grid gap-2">
          <label className="text-sm font-semibold text-ink" htmlFor="product-options">Product options (optional)</label>
          <textarea
            aria-describedby={errors.options ? "product-options-error" : "product-options-hint"}
            aria-invalid={Boolean(errors.options)}
            className={`min-h-36 w-full rounded-control border bg-white px-3.5 py-3 font-mono text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-1 ${errors.options ? "border-danger-700" : "border-border"}`}
            disabled={isPending || clearOptions}
            id="product-options"
            onChange={(event) => {
              setOptionsText(event.target.value);
              setOptionsChanged(true);
              setClearOptions(false);
            }}
            placeholder={'{\n  "sizes": ["S", "M", "L"]\n}'}
            value={optionsText}
          />
          <p className="text-sm text-ink-muted" id="product-options-hint">
            Enter a JSON object for the options this product supports. Values are saved as provided.
            {product && !optionsChanged && " Leave this unchanged to preserve the current options."}
          </p>
          {errors.options && <p className="text-sm text-danger-700" id="product-options-error">{errors.options}</p>}
          {product && (
            <Button
              disabled={isPending}
              onClick={() => {
                if (clearOptions) {
                  setClearOptions(false);
                  setOptionsChanged(false);
                  setOptionsText(initialOptionsText);
                } else {
                  setClearOptions(true);
                  setOptionsChanged(true);
                  setOptionsText("");
                }
                setErrors((current) => ({ ...current, options: undefined }));
              }}
              size="sm"
              type="button"
              variant={clearOptions ? "danger" : "secondary"}
            >
              {clearOptions ? "Undo clearing options" : "Clear options"}
            </Button>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          <Link className="inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-white px-4 text-sm font-semibold text-ink hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2" to={`/lives/${liveId}/products`}>
            Cancel
          </Link>
          <Button disabled={isPending} type="submit">
            {isPending ? "Saving…" : product ? "Save changes" : "Create product"}
          </Button>
        </div>
      </form>
    </>
  );
}

function productOptionsText(options: unknown): string {
  return typeof options === "object" && options !== null && !Array.isArray(options)
    ? JSON.stringify(options, null, 2)
    : "";
}
