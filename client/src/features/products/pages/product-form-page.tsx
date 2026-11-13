import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useMatch, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { EmptyState, LoadingState, Notice, RequestFailure } from "../../../components/feedback/feedback";
import { PageHeader } from "../../../components/layout/page-header";
import { Button } from "../../../components/ui/button";
import { ConfirmationDialog } from "../../../components/ui/confirmation-dialog";
import { TextField } from "../../../components/ui/text-field";
import { ApiError, TransportError } from "../../../lib/api-client";
import { parseCedisToPesewas, pesewasToCedisInput } from "../../../lib/product-price";
import { parseProductOptions, readProductOptionGroups, type ProductOptionGroup } from "../../../lib/product-options";
import { useCurrentCreator } from "../../auth/hooks/use-auth";
import { useLives } from "../../lives/hooks/use-lives";
import { productsApi, type Product, type ProductImage } from "../api/products-api";
import { ProductOptionsEditor } from "../components/product-options-editor";
import { ProductImageGallery } from "../components/product-image-gallery";
import {
  ProductImageField,
  type ProductImageUploadItem,
} from "../components/product-image-field";
import {
  clearPendingProductCreation,
  createProductCreationKey,
  loadPendingProductCreation,
  PendingProductCreationStorageError,
  savePendingProductCreation,
  type PendingProductCreation,
} from "../lib/pending-product-creation";
import {
  clearProductImageUploadAttempt,
  findProductImageUploadAttempt,
  getOrCreateProductImageUploadKey,
  listProductImageUploadAttempts,
  PendingProductImageUploadStorageError,
} from "../lib/pending-product-image-upload";
import { getProductImageFileError } from "../lib/product-image-validation";
import {
  useCreateProduct,
  usePendingProductImageUploads,
  useProducts,
  useRemoveProductImage,
  useSelectPrimaryProductImage,
  useUpdateProduct,
  useUploadProductImage,
  productsQueryKey,
} from "../hooks/use-products";

export function ProductFormPage() {
  const { liveId = "", productId } = useParams();
  const isImageSetupStep = Boolean(useMatch("/lives/:liveId/products/:productId/images"));
  const creator = useCurrentCreator();
  const lives = useLives();
  const products = useProducts(liveId, { enabled: Boolean(productId) });

  if (creator.isPending) return <LoadingState label="Restoring your seller session…" />;
  if (creator.isError || !creator.data) return <RequestFailure label="We couldn't verify your seller session." onRetry={() => void creator.refetch()} />;
  if (lives.isPending) {
    return <LoadingState label={productId ? "Loading product…" : "Loading this Live…"} />;
  }
  if (lives.isError && !lives.data) return <RequestFailure label="We couldn't load this Live." onRetry={() => void lives.refetch()} />;
  if (!lives.data) return <LoadingState label={productId ? "Loading product…" : "Loading this Live…"} />;
  if (productId && products.isPending) return <LoadingState label="Loading product…" />;
  if (productId && products.isError && !products.data) return <RequestFailure label="We couldn't load this Live's products." onRetry={() => void products.refetch()} />;
  if (productId && !products.data) return <LoadingState label="Loading product…" />;

  const live = lives.data.find((item) => item.id === liveId);
  if (!live) {
    return <EmptyState action={<Link className="font-semibold text-brand-700 underline" to="/lives">All Lives</Link>} description="This Live may have been removed or may not belong to your account." title="Live not found" />;
  }

  const product = productId ? products.data?.find((item) => item.id === productId && item.liveId === liveId) : undefined;
  if (productId && !product) {
    return <EmptyState action={<Link className="font-semibold text-brand-700 underline" to={`/lives/${liveId}/products`}>Back to products</Link>} description="The product may have been removed or may not belong to this Live." title="Product not found" />;
  }

  return <ProductEditor
    key={`${liveId}:${product?.id ?? "new"}`}
    creatorId={creator.data.id}
    liveId={liveId}
    liveName={live.name}
    product={product}
    imageSetupStep={isImageSetupStep}
    refreshError={Boolean(lives.isError || products.isError)}
  />;
}

function imageUploadErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.code === "PRODUCT_IMAGE_LIMIT_REACHED") {
    return "This product has reached the three-image limit. Remove an image before adding another.";
  }
  if (error instanceof ApiError && error.code === "IMAGE_STORAGE_NOT_CONFIGURED") {
    return "Image uploads are not configured yet. Ask the administrator to add the image-storage credentials.";
  }
  if (error instanceof ApiError && error.code === "IMAGE_TOO_LARGE") {
    return "Product images must be 5 MB or smaller. Choose a smaller image and retry.";
  }
  if (error instanceof ApiError && error.code === "INVALID_IMAGE_FORMAT") {
    return "Choose a valid JPEG, PNG, or WebP image and retry.";
  }
  if (error instanceof ApiError && error.code === "IMAGE_STORAGE_FAILED") {
    return "The image provider could not save this file. Check the image and retry later.";
  }
  if (error instanceof ApiError && error.status === 400) {
    return "The server rejected this image. Choose a JPEG, PNG, or WebP image and retry.";
  }
  return "We couldn't upload this image. Retry this file; other successful uploads are unchanged.";
}

function imageRemovalErrorMessage(error: unknown) {
  if (error instanceof ApiError && error.code === "IMAGE_STORAGE_NOT_CONFIGURED") {
    return "Image uploads are not configured yet. Ask the administrator to add the Cloudinary server credentials.";
  }
  if (error instanceof ApiError && error.code === "INVALID_IMAGE_FORMAT") {
    return "The file contents do not match a supported JPEG, PNG, or WebP image. Re-export the image in one of those formats and try again.";
  }
  if (error instanceof ApiError && error.code === "IMAGE_TOO_LARGE") {
    return "Product images must be 5 MB or smaller. Choose a smaller image and try again.";
  }
  if (error instanceof ApiError && error.code === "INVALID_IMAGE_UPLOAD") {
    return "The server did not receive exactly one image file. Choose one image and retry.";
  }
  if (error instanceof ApiError && error.code === "IMAGE_REQUIRED") {
    return "Choose an image file before uploading.";
  }
  if (error instanceof ApiError && error.code === "IMAGE_STORAGE_FAILED") {
    return "The image provider could not save this file. Check the image and try again later.";
  }
  if (error instanceof ApiError && error.status === 400) {
    return "The server rejected this image upload. Choose a JPEG, PNG, or WebP image and retry.";
  }
  return "We couldn't remove this image. It remains in the gallery; please try again.";
}

function ProductEditor({ creatorId, liveId, liveName, product, imageSetupStep, refreshError }: { creatorId: string; liveId: string; liveName: string; product?: Product; imageSetupStep: boolean; refreshError: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const uploadImage = useUploadProductImage();
  const pendingImageUploads = usePendingProductImageUploads(liveId, product?.id ?? "", Boolean(product));
  const removeImage = useRemoveProductImage();
  const selectPrimaryImage = useSelectPrimaryProductImage();
  const existingOptions = readProductOptionGroups(product?.options);
  const primaryImage = product?.images.find((image) => image.isPrimary) ?? product?.images[0];
  const [recoveryState] = useState(() => {
    if (product) return { attempt: null, error: null };
    try {
      return { attempt: loadPendingProductCreation(creatorId, liveId), error: null };
    } catch (error) {
      return {
        attempt: null,
        error: error instanceof PendingProductCreationStorageError
          ? error.message
          : "Saved product recovery data could not be read safely.",
      };
    }
  });
  const [pendingAttempt, setPendingAttempt] = useState<PendingProductCreation | null>(recoveryState.attempt);
  const recoveryError = recoveryState.error;
  const [storageError, setStorageError] = useState<string | null>(null);
  const [confirmedProduct, setConfirmedProduct] = useState(false);
  const [draft, setDraft] = useState<{
    name?: string;
    price?: string;
    stockQuantity?: string;
    groups?: ProductOptionGroup[];
  }>(() => {
    if (!recoveryState.attempt || product) return {};
    const savedOptions = readProductOptionGroups(recoveryState.attempt.input.options);
    return {
      name: recoveryState.attempt.input.name,
      price: pesewasToCedisInput(recoveryState.attempt.input.price),
      stockQuantity: String(recoveryState.attempt.input.stockQuantity ?? 0),
      groups: savedOptions.supported ? savedOptions.groups : [],
    };
  });
  const name = draft.name ?? product?.name ?? "";
  const price = draft.price ?? (product ? pesewasToCedisInput(product.price) : "");
  const stockQuantity = draft.stockQuantity ?? String(product?.stockQuantity ?? 0);
  const groups = draft.groups ?? (existingOptions.supported ? existingOptions.groups : []);
  const [optionsChanged, setOptionsChanged] = useState(false);
  const [replaceLegacyOptions, setReplaceLegacyOptions] = useState(false);
  const [clearOptions, setClearOptions] = useState(false);
  const [imageUploads, setImageUploads] = useState<ProductImageUploadItem[]>([]);
  const [imageSelectionMessage, setImageSelectionMessage] = useState<string | null>(null);
  const [storedImageAttemptKeys, setStoredImageAttemptKeys] = useState<string[]>([]);
  const [imageRecoveryStorageError, setImageRecoveryStorageError] = useState<string | null>(null);
  const [imageRecoveryNotice, setImageRecoveryNotice] = useState<string | null>(null);
  const [imageToRemove, setImageToRemove] = useState<ProductImage | null>(null);
  const [selectingImageId, setSelectingImageId] = useState<string | null>(null);
  const [removingImageId, setRemovingImageId] = useState<string | null>(null);
  const [imageManagementError, setImageManagementError] = useState<string | null>(null);
  const [imageUploadRecoveryError, setImageUploadRecoveryError] = useState<string | null>(null);
  const [preparingImageUpload, setPreparingImageUpload] = useState(false);
  const preparingImageFiles = useRef(false);
  const activeImageUploads = useRef(new Set<string>());
  const primarySelectionInProgress = useRef(false);
  const removalInProgress = useRef(false);
  const recoveringCompletedKeys = useRef(new Set<string>());
  const [errors, setErrors] = useState<{ name?: string; price?: string; stock?: string; options?: string }>({});
  const isPending = createProduct.isPending || updateProduct.isPending || preparingImageUpload;
  const hasImageUploadInProgress = imageUploads.some((upload) => upload.status === "uploading");
  const mutationError = createProduct.error ?? updateProduct.error;
  const pendingUploadItems = (pendingImageUploads.data ?? []).map((pending) => ({
    idempotencyKey: pending.idempotencyKey,
    hasLocalAttempt: storedImageAttemptKeys.includes(pending.idempotencyKey),
    hasMatchingFile: imageUploads.some((upload) =>
      upload.idempotencyKey === pending.idempotencyKey && upload.isRecovery,
    ),
  }));
  const pendingUploadKeys = new Set(pendingUploadItems.map((pending) => pending.idempotencyKey));

  useEffect(() => {
    if (!product) return;
    try {
      const attempts = listProductImageUploadAttempts(creatorId, liveId, product.id);
      setStoredImageAttemptKeys(attempts.map((attempt) => attempt.idempotencyKey));
      setImageRecoveryStorageError(null);
    } catch (error) {
      setStoredImageAttemptKeys([]);
      setImageRecoveryStorageError(error instanceof PendingProductImageUploadStorageError
        ? error.message
        : "Saved upload recovery details could not be read. Pending uploads will not be retried with a new key.");
    }
  }, [creatorId, liveId, pendingImageUploads.dataUpdatedAt, product]);

  useEffect(() => {
    if (!product || !pendingImageUploads.data || imageRecoveryStorageError) return;
    const pendingKeys = new Set(pendingImageUploads.data.map((pending) => pending.idempotencyKey));
    const completedKeys = storedImageAttemptKeys.filter((key) => !pendingKeys.has(key));
    for (const key of completedKeys) {
      if (recoveringCompletedKeys.current.has(key)) continue;
      recoveringCompletedKeys.current.add(key);
      void productsApi.getImageUploadStatus(liveId, key).then(async (status) => {
        if (status.status !== "COMPLETED" || status.productId !== product.id) return;
        setImageRecoveryNotice("An upload completed before the page refreshed. The product gallery has been updated.");
        await queryClient.invalidateQueries({ queryKey: productsQueryKey(liveId), exact: true });
        try {
          clearProductImageUploadAttempt(creatorId, liveId, product.id, key);
          setStoredImageAttemptKeys((current) => current.filter((storedKey) => storedKey !== key));
        } catch {
          setImageUploadRecoveryError("The upload completed, but its browser recovery record could not be cleared.");
        }
      }).catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 404) return;
        setImageRecoveryStorageError("An earlier upload could not be checked. Its retry details have been kept; reselect the original file to verify it safely.");
      }).finally(() => {
        recoveringCompletedKeys.current.delete(key);
      });
    }
  }, [
    creatorId,
    imageRecoveryStorageError,
    liveId,
    pendingImageUploads.data,
    product,
    queryClient,
    storedImageAttemptKeys,
  ]);

  function submitCreate(attempt: PendingProductCreation) {
    createProduct.mutate(
      { liveId, input: attempt.input, idempotencyKey: attempt.idempotencyKey },
      {
        onSuccess: (createdProduct) => {
          try {
            clearPendingProductCreation(creatorId, liveId);
            setPendingAttempt(null);
            setStorageError(null);
            navigate(`/lives/${liveId}/products/${encodeURIComponent(createdProduct.id)}/images`);
          } catch (error) {
            setConfirmedProduct(true);
            setStorageError(error instanceof PendingProductCreationStorageError
              ? `The product was created, but ${error.message.toLocaleLowerCase()} Retry this same request before starting another product.`
              : "The product was created, but its recovery record could not be cleared. Retry this same request before starting another product.");
          }
        },
      },
    );
  }

  function discardRejectedAttempt() {
    if (!pendingAttempt) return;
    try {
      clearPendingProductCreation(creatorId, liveId);
      setPendingAttempt(null);
      setConfirmedProduct(false);
      setStorageError(null);
      createProduct.reset();
    } catch (error) {
      setStorageError(error instanceof PendingProductCreationStorageError
        ? error.message
        : "The saved product recovery data could not be cleared.");
    }
  }

  function startNewProductAfterDeletion() {
    if (!pendingAttempt) return;
    try {
      clearPendingProductCreation(creatorId, liveId);
      setPendingAttempt(null);
      setDraft({ name: "", price: "", stockQuantity: "0", groups: [] });
      setStorageError(null);
      createProduct.reset();
    } catch (error) {
      setStorageError(error instanceof PendingProductCreationStorageError
        ? error.message
        : "The deleted product recovery data could not be cleared.");
    }
  }

  async function addImageFiles(files: File[]) {
    if (!product || preparingImageFiles.current) return;
    preparingImageFiles.current = true;
    setPreparingImageUpload(true);
    setImageSelectionMessage(null);
    try {
      const currentUploads = imageUploads;
      const availableSlots = availableImageSlots;
      const additions: ProductImageUploadItem[] = [];
      const keys = new Set(currentUploads
        .filter((upload) => upload.status !== "succeeded")
        .map((upload) => upload.idempotencyKey));

      for (const file of files) {
        if (additions.length >= availableSlots) {
          setImageSelectionMessage("This product has reached the three-image limit. Some selected images were not added.");
          break;
        }
        if (getProductImageFileError(file)) {
          additions.push({
            id: globalThis.crypto.randomUUID(),
            file,
            idempotencyKey: "",
            status: "selected",
          });
          continue;
        }
        try {
          const storedAttempt = await findProductImageUploadAttempt(
            creatorId, liveId, product.id, file,
          );
          const idempotencyKey = storedAttempt?.idempotencyKey ??
            await getOrCreateProductImageUploadKey(creatorId, liveId, product.id, file);
          if (keys.has(idempotencyKey)) {
            setImageSelectionMessage("That file is already in the upload list. Retry it there instead of adding it again.");
            continue;
          }
          let isRecovery = pendingUploadKeys.has(idempotencyKey);
          if (storedAttempt && !isRecovery) {
            try {
              const status = await productsApi.getImageUploadStatus(liveId, idempotencyKey);
              if (status.productId !== product.id) {
                setImageSelectionMessage("This saved upload belongs to a different product and cannot be retried here.");
                continue;
              }
              if (status.status === "COMPLETED") {
                setImageRecoveryNotice("This image had already finished uploading. The gallery has been refreshed without uploading it again.");
                await queryClient.invalidateQueries({ queryKey: productsQueryKey(liveId), exact: true });
                try {
                  clearProductImageUploadAttempt(creatorId, liveId, product.id, idempotencyKey);
                  setStoredImageAttemptKeys((current) => current.filter((key) => key !== idempotencyKey));
                } catch {
                  setImageUploadRecoveryError("The upload completed, but its browser recovery record could not be cleared.");
                }
                continue;
              }
              isRecovery = true;
            } catch (error) {
              if (!(error instanceof ApiError && error.status === 404)) throw error;
            }
          }
          keys.add(idempotencyKey);
          additions.push({
            id: globalThis.crypto.randomUUID(),
            file,
            idempotencyKey,
            status: "selected",
            ...(isRecovery ? { isRecovery: true } : {}),
          });
          if (!storedAttempt && pendingUploadItems.length > 0) {
            setImageSelectionMessage("This file doesn't match a saved unfinished upload, so it will use a new upload request. To recover an unfinished upload, choose its exact original file.");
          }
        } catch (error) {
          setImageUploadRecoveryError(error instanceof PendingProductImageUploadStorageError
            ? error.message
            : "A saved upload could not be verified, so this image was not started. Please try again.");
        }
      }

      if (additions.length > 0) setImageUploads((current) => [...current, ...additions]);
    } finally {
      preparingImageFiles.current = false;
      setPreparingImageUpload(false);
    }
  }

  async function uploadImageItem(uploadId: string) {
    if (!product || activeImageUploads.current.has(uploadId)) return;
    const upload = imageUploads.find((item) => item.id === uploadId);
    if (!upload || (upload.status !== "selected" && upload.status !== "failed")) return;
    const fileError = getProductImageFileError(upload.file);
    if (fileError) return;

    activeImageUploads.current.add(uploadId);
    setImageUploads((current) => current.map((item) =>
      item.id === uploadId ? { ...item, status: "uploading", errorMessage: undefined } : item,
    ));
    setImageUploadRecoveryError(null);

    try {
      await uploadImage.mutateAsync({
        liveId,
        productId: product.id,
        file: upload.file,
        idempotencyKey: upload.idempotencyKey,
      });
      setImageUploads((current) => current.map((item) =>
        item.id === uploadId ? { ...item, status: "succeeded" } : item,
      ));
      try {
        clearProductImageUploadAttempt(creatorId, liveId, product.id, upload.idempotencyKey);
      } catch (error) {
        setImageUploadRecoveryError(error instanceof PendingProductImageUploadStorageError
          ? error.message
          : "The completed image upload recovery record could not be cleared.");
      }
    } catch (error) {
      try {
        const status = await productsApi.getImageUploadStatus(liveId, upload.idempotencyKey);
        if (status.productId === product.id && status.status === "COMPLETED") {
          setImageUploads((current) => current.map((item) =>
            item.id === uploadId ? { ...item, status: "succeeded" } : item,
          ));
          setImageRecoveryNotice("This image had already finished uploading. The gallery has been refreshed without uploading it again.");
          await queryClient.invalidateQueries({ queryKey: productsQueryKey(liveId), exact: true });
          try {
            clearProductImageUploadAttempt(creatorId, liveId, product.id, upload.idempotencyKey);
            setStoredImageAttemptKeys((current) => current.filter((key) => key !== upload.idempotencyKey));
          } catch {
            setImageUploadRecoveryError("The upload completed, but its browser recovery record could not be cleared.");
          }
          return;
        }
      } catch (statusError) {
        if (!(statusError instanceof ApiError && statusError.status === 404)) {
          setImageUploadRecoveryError("The upload result could not be checked. Its retry details have been kept; retry this exact file safely.");
        }
      }
      if (error instanceof ApiError && error.code === "PRODUCT_IMAGE_LIMIT_REACHED") {
        setImageSelectionMessage("The server reports that this product has reached the three-image limit. The gallery will refresh.");
        void queryClient.invalidateQueries({ queryKey: productsQueryKey(liveId), exact: true });
      }
      setImageUploads((current) => current.map((item) =>
        item.id === uploadId ? { ...item, status: "failed", errorMessage: imageUploadErrorMessage(error) } : item,
      ));
    } finally {
      activeImageUploads.current.delete(uploadId);
    }
  }

  function uploadSelectedImages() {
    const uploadIds = imageUploads
      .filter((upload) =>
        (upload.status === "selected" || upload.status === "failed") &&
        !upload.isRecovery &&
        !getProductImageFileError(upload.file),
      )
      .map((upload) => upload.id);
    void Promise.all(uploadIds.map((uploadId) => uploadImageItem(uploadId)));
  }

  function removeSelectedImage(uploadId: string) {
    setImageUploads((current) => current.filter((upload) =>
      upload.id !== uploadId || upload.status === "uploading" || upload.status === "succeeded",
    ));
  }

  async function makeImagePrimary(imageId: string) {
    if (!product || primarySelectionInProgress.current || hasImageUploadInProgress) return;
    primarySelectionInProgress.current = true;
    setSelectingImageId(imageId);
    setImageManagementError(null);
    try {
      await selectPrimaryImage.mutateAsync({ liveId, productId: product.id, imageId });
    } catch {
      setImageManagementError("We couldn't make this image primary. The current primary image has not changed.");
    } finally {
      primarySelectionInProgress.current = false;
      setSelectingImageId(null);
    }
  }

  async function confirmImageRemoval() {
    if (!product || !imageToRemove || removalInProgress.current || hasImageUploadInProgress) return;
    const imageId = imageToRemove.id;
    removalInProgress.current = true;
    setRemovingImageId(imageId);
    setImageManagementError(null);
    try {
      await removeImage.mutateAsync({ liveId, productId: product.id, imageId });
      setImageToRemove(null);
    } catch (error) {
      setImageManagementError(imageRemovalErrorMessage(error));
      setImageToRemove(null);
    } finally {
      removalInProgress.current = false;
      setRemovingImageId(null);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (createProduct.isPending || hasImageUploadInProgress || recoveryError) return;
    if (!product && pendingAttempt) {
      submitCreate(pendingAttempt);
      return;
    }

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
      try {
        const input = {
          name: normalizedName,
          price: parsedPrice.value,
          stockQuantity: parsedStock,
          ...(parsedOptions?.ok && Object.keys(parsedOptions.value).length > 0 ? { options: parsedOptions.value } : {}),
        };
        const attempt = { idempotencyKey: createProductCreationKey(), input };
        savePendingProductCreation(creatorId, liveId, attempt);
        setPendingAttempt(attempt);
        setStorageError(null);
        submitCreate(attempt);
      } catch (error) {
        setStorageError(error instanceof PendingProductCreationStorageError
          ? error.message
          : "Product recovery data could not be saved, so the product was not submitted.");
      }
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

  const idempotencyConflict = createProduct.error instanceof ApiError &&
    createProduct.error.code === "IDEMPOTENCY_KEY_REUSED";
  const deletedCreationResult = createProduct.error instanceof ApiError &&
    createProduct.error.code === "IDEMPOTENCY_RESULT_DELETED";
  const safelyRejectedCreate = createProduct.error instanceof ApiError &&
    createProduct.error.status >= 400 &&
    createProduct.error.status < 500 &&
      createProduct.error.status !== 408 &&
      !idempotencyConflict &&
      !deletedCreationResult;
  const createErrorMessage = deletedCreationResult
      ? "This product was created successfully but has since been deleted. Retrying this saved request will not recreate it."
      : idempotencyConflict
        ? "This request key is already associated with different product details. The saved attempt has been kept; do not start a new attempt from it."
        : safelyRejectedCreate
          ? "The server rejected this request before creating a product. You may discard this saved attempt deliberately, then correct the details and try again."
      : createProduct.error instanceof TransportError ||
          (createProduct.error instanceof ApiError && (createProduct.error.status === 408 || createProduct.error.status >= 500)) ||
        (createProduct.error !== null && !(createProduct.error instanceof ApiError))
        ? "We couldn't confirm whether the product was saved. Your details and request key are kept; retry this same attempt safely. If it was already saved, the existing product will be returned."
        : "The server rejected one or more product fields. Check the name, price, stock and options, then try again.";
  const mutationErrorMessage = product
    ? mutationError instanceof ApiError && mutationError.status === 404
      ? "This product or Live is no longer available. Return to the product list and refresh."
      : "We couldn't save this product. Your current changes are still here; please try again."
    : createErrorMessage;
  const availableImageSlots = Math.max(
    0,
    3 - (product?.images.length ?? 0) -
      (pendingImageUploads.data?.length ?? 0) -
      imageUploads.filter((upload) =>
        !upload.isRecovery && upload.status !== "succeeded" && !getProductImageFileError(upload.file),
      ).length,
  );

  return (
    <>
      <Link className="mb-5 inline-flex text-sm font-semibold text-brand-700 hover:text-brand-900" to={imageSetupStep && product ? `/lives/${liveId}/products/${encodeURIComponent(product.id)}/edit` : `/lives/${liveId}/products`}>{imageSetupStep ? "← Product details" : "← Back to products"}</Link>
      <PageHeader
        description={imageSetupStep
          ? `Your product is ready for ${liveName}. Add photos now or continue without them.`
          : `${product ? "Update product details for" : "Add a product to"} ${liveName}.`}
        eyebrow="Live workspace"
        title={imageSetupStep ? "Add product images" : product ? "Edit product" : "Add product"}
      />
      {imageSetupStep && <div className="mb-5"><Notice title="Product created." tone="success">Add up to three clear photos for <strong>{product?.name}</strong> to help customers recognize it, or continue without images.</Notice></div>}
      {refreshError && <div className="mb-5"><Notice title="The latest Live or product data could not be refreshed. Your current form values are preserved." /></div>}
      {pendingAttempt && !product && !deletedCreationResult && <div className="mb-5"><Notice title="An unfinished product creation was found." tone="info">The saved details and request key will be reused. Retrying is safe: if the product was already created, the server will return that product. Edit details only after this attempt succeeds or is deliberately discarded after a definite rejection.</Notice></div>}
      {recoveryError && <div className="mb-5"><Notice title={recoveryError}>Do not submit a new product from this tab until the saved attempt can be recovered.</Notice></div>}
      {storageError && <div className="mb-5"><Notice title={storageError} /></div>}
      {(updateProduct.isError || (createProduct.isError && !deletedCreationResult)) && <div className="mb-5"><Notice title={mutationErrorMessage} /></div>}
      {createProduct.isError && deletedCreationResult && pendingAttempt && (
        <div className="mb-5">
          <Notice
            action={<Button onClick={startNewProductAfterDeletion} size="sm" variant="secondary">Start a new product</Button>}
            title="This product was created successfully but has since been deleted."
          >
            This saved request cannot recreate it. Starting a new product clears this recovery attempt; the new submission will use a fresh request key.
          </Notice>
        </div>
      )}
      {createProduct.isError && safelyRejectedCreate && pendingAttempt && (
        <div className="mb-5">
          <Notice title="This attempt was rejected and no product was created." action={<Button onClick={discardRejectedAttempt} size="sm" variant="secondary">Discard rejected attempt and edit</Button>} />
        </div>
      )}
      {confirmedProduct && <div className="mb-5"><Notice title="Product creation succeeded, but browser recovery data is still present." tone="info">Retry with the same details to finish clearing the recovery record before starting another product.</Notice></div>}

      <form className={`${imageSetupStep ? "max-w-4xl" : "max-w-2xl"} space-y-5`} noValidate onSubmit={submit}>
        {!imageSetupStep && <>
        <TextField autoComplete="off" disabled={isPending || Boolean(pendingAttempt) || Boolean(recoveryError)} error={errors.name} label="Product name" maxLength={100} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} required value={name} />
        <TextField disabled={isPending || Boolean(pendingAttempt) || Boolean(recoveryError)} error={errors.price} hint="Enter the amount in Ghanaian cedis, for example 25.50." inputMode="decimal" label="Price (GHS)" onChange={(event) => setDraft((current) => ({ ...current, price: event.target.value }))} placeholder="0.00" required value={price} />
        <TextField disabled={isPending || Boolean(pendingAttempt) || Boolean(recoveryError)} error={errors.stock} hint="This is the quantity available to order. Option choices do not have separate stock." inputMode="numeric" label="Stock quantity" min={0} onChange={(event) => setDraft((current) => ({ ...current, stockQuantity: event.target.value }))} required step={1} type="number" value={stockQuantity} />

        {product && !existingOptions.supported && !replaceLegacyOptions && (
          <Notice title="This product has options in an older format." tone="info">
            They will be preserved until you choose to replace them with editable option groups.
          </Notice>
        )}
        {product && !existingOptions.supported && !replaceLegacyOptions ? (
              <Button onClick={() => { setReplaceLegacyOptions(true); setOptionsChanged(true); setDraft((current) => ({ ...current, groups: [] })); }} type="button" variant="secondary">Replace legacy options</Button>
        ) : (
          <>
            <ProductOptionsEditor
              disabled={isPending || clearOptions || Boolean(pendingAttempt) || Boolean(recoveryError)}
              groups={groups}
              onChange={(nextGroups) => { setDraft((current) => ({ ...current, groups: nextGroups })); setOptionsChanged(true); setClearOptions(false); }}
            />
            {errors.options && <p className="text-sm text-danger-700" role="alert">{errors.options}</p>}
            {product && (
              <Button
                disabled={isPending || Boolean(pendingAttempt) || Boolean(recoveryError)}
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
        </>}

        {product && (
          <ProductImageGallery
            images={product.images}
            actionsDisabled={hasImageUploadInProgress || preparingImageUpload}
            onMakePrimary={(imageId) => void makeImagePrimary(imageId)}
            onRemoveImage={setImageToRemove}
            productName={product.name}
            removingImageId={removingImageId}
            selectingImageId={selectingImageId}
          />
        )}
        {product
          ? <ProductImageField
              currentImageUrl={primaryImage?.url}
              availableSlots={availableImageSlots}
              disabled={createProduct.isPending || updateProduct.isPending || Boolean(recoveryError)}
              onFilesSelected={(files) => void addImageFiles(files)}
              onRemoveSelected={removeSelectedImage}
              onRetryUpload={(uploadId) => void uploadImageItem(uploadId)}
              onUploadSelected={uploadSelectedImages}
              preparing={preparingImageUpload}
              pendingUploads={pendingUploadItems}
              pendingUploadsLoading={pendingImageUploads.isPending}
              pendingUploadsError={pendingImageUploads.isError
                ? "Unfinished uploads could not be checked. Refresh this page or try again before starting another upload."
                : null}
              recoveryStorageError={imageRecoveryStorageError}
              selectionDisabled={pendingImageUploads.isPending || pendingImageUploads.isError}
              productName={product.name}
              selectionMessage={imageSelectionMessage}
              uploads={imageUploads}
            />
          : <Notice title="You can add an image after creating this product." tone="info" />}
        {imageManagementError && <Notice title={imageManagementError} />}
        {imageUploadRecoveryError ? <Notice title={imageUploadRecoveryError} /> : null}
        {imageRecoveryNotice ? <Notice title={imageRecoveryNotice} tone="success" /> : null}
        {product && imageUploads.some((upload) => upload.status === "succeeded") ? <Notice title="Product image updated." tone="success" /> : null}

        {imageSetupStep ? (
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
            <Link className="inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-white px-4 text-sm font-semibold text-ink hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2" state={{ productNotice: "created" }} to={`/lives/${liveId}/products`}>
              {product?.images.length ? "Continue to products" : "Continue without images"}
            </Link>
            <Link className="inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-white px-4 text-sm font-semibold text-ink hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2" to={`/lives/${liveId}/products/new`}>
              Add another product
            </Link>
          </div>
        ) : (
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <Link className="inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-white px-4 text-sm font-semibold text-ink hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2" to={`/lives/${liveId}/products`}>{pendingAttempt ? "Back to products" : "Cancel"}</Link>
            <Button disabled={isPending || hasImageUploadInProgress || Boolean(recoveryError) || (deletedCreationResult && Boolean(pendingAttempt))} type="submit">{isPending ? "Saving…" : product ? "Save changes" : confirmedProduct ? "Confirm saved product" : deletedCreationResult && pendingAttempt ? "Creation result deleted" : pendingAttempt ? "Retry saved creation" : "Create product"}</Button>
          </div>
        )}
      </form>

      <ConfirmationDialog
        cancelLabel="Keep image"
        confirmLabel={removingImageId ? "Removing…" : "Remove image"}
        description={`“${imageToRemove && product ? `${product.name} image ${product.images.findIndex((image) => image.id === imageToRemove.id) + 1}` : "This image"}” will be removed from customer pages.`}
        isPending={removingImageId !== null}
        onCancel={() => setImageToRemove(null)}
        onConfirm={() => void confirmImageRemoval()}
        open={imageToRemove !== null}
        title="Remove this image?"
      />
    </>
  );
}
