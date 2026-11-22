import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  productsApi,
  type CreateProductInput,
  type Product,
  type ProductImageUploadResult,
  type UpdateProductInput,
} from "../api/products-api";
import { publicLiveQueryKey } from "../../public-live/hooks/use-public-live";

export const productsQueryKey = (storeId: string) => ["stores", storeId, "products"] as const;
export const productsPageQueryKey = (storeId: string, page: number, limit: number) =>
  [...productsQueryKey(storeId), { page, limit }] as const;
export const productDetailQueryKey = (storeId: string, productId: string) =>
  [...productsQueryKey(storeId), "detail", productId] as const;
export const productImageUploadsQueryKey = (storeId: string, productId: string) =>
  ["stores", storeId, "product-image-uploads", productId] as const;
export const productImageUploadStatusQueryKey = (storeId: string, idempotencyKey: string) =>
  ["stores", storeId, "product-image-upload-status", idempotencyKey] as const;

export function useProducts(
  storeId: string,
  page: number,
  limit: number,
  options: { enabled?: boolean; refetchOnMount?: boolean | "always" } = {},
) {
  return useQuery({
    queryKey: productsPageQueryKey(storeId, page, limit),
    queryFn: ({ signal }) => productsApi.list(storeId, page, limit, signal),
    ...options,
    enabled: Boolean(storeId) && (options.enabled ?? true),
  });
}

export function useProduct(storeId: string, productId: string | undefined) {
  return useQuery({
    queryKey: productDetailQueryKey(storeId, productId ?? ""),
    queryFn: ({ signal }) => productsApi.get(storeId, productId!, signal),
    enabled: Boolean(storeId && productId),
  });
}

export function usePendingProductImageUploads(storeId: string, productId: string, enabled = true) {
  return useQuery({
    queryKey: productImageUploadsQueryKey(storeId, productId),
    queryFn: ({ signal }) => productsApi.listPendingImageUploads(storeId, productId, signal),
    enabled: Boolean(storeId && productId) && enabled,
  });
}

export function useProductImageUploadStatus(
  storeId: string,
  idempotencyKey: string,
  enabled = true,
) {
  return useQuery({
    queryKey: productImageUploadStatusQueryKey(storeId, idempotencyKey),
    queryFn: ({ signal }) => productsApi.getImageUploadStatus(storeId, idempotencyKey, signal),
    enabled: Boolean(storeId && idempotencyKey) && enabled,
  });
}

async function updateProductAfterImageMutation(
  queryClient: ReturnType<typeof useQueryClient>,
  updatedProduct: Product,
  storeId: string,
) {
  const queryKey = productsQueryKey(storeId);
  queryClient.setQueryData<Product>(productDetailQueryKey(storeId, updatedProduct.id), updatedProduct);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey }),
    queryClient.invalidateQueries({ queryKey: publicLiveQueryKey() }),
  ]);
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ storeId, input, idempotencyKey }: {
      storeId: string;
      input: CreateProductInput;
      idempotencyKey: string;
    }) => productsApi.create(storeId, input, idempotencyKey),
    onSuccess: async (_createdProduct, { storeId }) => {
      const queryKey = productsQueryKey(storeId);
      await queryClient.invalidateQueries({ queryKey });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      storeId,
      productId,
      input,
    }: {
      storeId: string;
      productId: string;
      input: UpdateProductInput;
    }) => productsApi.update(storeId, productId, input),
    onSuccess: async (updatedProduct, { storeId }) => {
      const queryKey = productsQueryKey(storeId);
      queryClient.setQueryData<Product>(productDetailQueryKey(storeId, updatedProduct.id), updatedProduct);
      await queryClient.invalidateQueries({ queryKey });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ storeId, productId }: { storeId: string; productId: string }) =>
      productsApi.delete(storeId, productId),
    onSuccess: async (_result, { storeId, productId }) => {
      const queryKey = productsQueryKey(storeId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.removeQueries({ queryKey: productDetailQueryKey(storeId, productId), exact: true }),
      ]);
    },
  });
}

export function useUploadProductImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      storeId,
      productId,
      file,
      idempotencyKey,
    }: {
      storeId: string;
      productId: string;
      file: File;
      idempotencyKey: string;
    }) => productsApi.uploadImage(storeId, productId, file, idempotencyKey),
    onSuccess: async (result: ProductImageUploadResult, { storeId, productId, idempotencyKey }) => {
      await Promise.all([
        updateProductAfterImageMutation(queryClient, result.product, storeId),
        queryClient.invalidateQueries({
          queryKey: productImageUploadsQueryKey(storeId, productId),
          exact: true,
        }),
        queryClient.invalidateQueries({
          queryKey: productImageUploadStatusQueryKey(storeId, idempotencyKey),
          exact: true,
        }),
      ]);
    },
  });
}

export function useSelectPrimaryProductImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storeId, productId, imageId }: { storeId: string; productId: string; imageId: string }) =>
      productsApi.selectPrimaryImage(storeId, productId, imageId),
    onSuccess: async (updatedProduct, { storeId }) =>
      updateProductAfterImageMutation(queryClient, updatedProduct, storeId),
  });
}

export function useRemoveProductImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storeId, productId, imageId }: { storeId: string; productId: string; imageId: string }) =>
      productsApi.removeImage(storeId, productId, imageId),
    onSuccess: async (updatedProduct, { storeId }) => {
      await updateProductAfterImageMutation(queryClient, updatedProduct, storeId);
    },
  });
}
