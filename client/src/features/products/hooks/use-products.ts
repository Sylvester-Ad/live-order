import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  productsApi,
  type CreateProductInput,
  type Product,
  type ProductImageUploadResult,
  type UpdateProductInput,
} from "../api/products-api";
import { publicLiveQueryKey } from "../../public-live/hooks/use-public-live";

export const productsQueryKey = (liveId: string) => ["products", liveId] as const;
export const productImageUploadsQueryKey = (liveId: string, productId: string) =>
  ["product-image-uploads", liveId, productId] as const;
export const productImageUploadStatusQueryKey = (liveId: string, idempotencyKey: string) =>
  ["product-image-upload-status", liveId, idempotencyKey] as const;

export function useProducts(
  liveId: string,
  options: { enabled?: boolean; refetchOnMount?: boolean | "always" } = {},
) {
  return useQuery({
    queryKey: productsQueryKey(liveId),
    queryFn: ({ signal }) => productsApi.list(liveId, signal),
    ...options,
    enabled: Boolean(liveId) && (options.enabled ?? true),
  });
}

export function usePendingProductImageUploads(liveId: string, productId: string, enabled = true) {
  return useQuery({
    queryKey: productImageUploadsQueryKey(liveId, productId),
    queryFn: ({ signal }) => productsApi.listPendingImageUploads(liveId, productId, signal),
    enabled: Boolean(liveId && productId) && enabled,
  });
}

export function useProductImageUploadStatus(
  liveId: string,
  idempotencyKey: string,
  enabled = true,
) {
  return useQuery({
    queryKey: productImageUploadStatusQueryKey(liveId, idempotencyKey),
    queryFn: ({ signal }) => productsApi.getImageUploadStatus(liveId, idempotencyKey, signal),
    enabled: Boolean(liveId && idempotencyKey) && enabled,
  });
}

async function updateProductAfterImageMutation(
  queryClient: ReturnType<typeof useQueryClient>,
  updatedProduct: Product,
  liveId: string,
) {
  const queryKey = productsQueryKey(liveId);
  queryClient.setQueryData<Product[]>(queryKey, (products) =>
    products?.map((product) => product.id === updatedProduct.id ? updatedProduct : product),
  );
  await Promise.all([
    queryClient.invalidateQueries({ queryKey, exact: true }),
    queryClient.invalidateQueries({ queryKey: publicLiveQueryKey() }),
  ]);
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ liveId, input, idempotencyKey }: {
      liveId: string;
      input: CreateProductInput;
      idempotencyKey: string;
    }) => productsApi.create(liveId, input, idempotencyKey),
    onSuccess: async (createdProduct, { liveId }) => {
      const queryKey = productsQueryKey(liveId);
      queryClient.setQueryData<Product[]>(queryKey, (products) =>
        products ? [...products, createdProduct] : [createdProduct],
      );
      await queryClient.invalidateQueries({ queryKey, exact: true });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      liveId,
      productId,
      input,
    }: {
      liveId: string;
      productId: string;
      input: UpdateProductInput;
    }) => productsApi.update(liveId, productId, input),
    onSuccess: async (updatedProduct, { liveId }) => {
      const queryKey = productsQueryKey(liveId);
      queryClient.setQueryData<Product[]>(queryKey, (products) =>
        products?.map((product) => product.id === updatedProduct.id ? updatedProduct : product),
      );
      await queryClient.invalidateQueries({ queryKey, exact: true });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ liveId, productId }: { liveId: string; productId: string }) =>
      productsApi.delete(liveId, productId),
    onSuccess: async (_result, { liveId, productId }) => {
      const queryKey = productsQueryKey(liveId);
      queryClient.setQueryData<Product[]>(queryKey, (products) =>
        products?.filter((product) => product.id !== productId),
      );
      await queryClient.invalidateQueries({ queryKey, exact: true });
    },
  });
}

export function useUploadProductImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      liveId,
      productId,
      file,
      idempotencyKey,
    }: {
      liveId: string;
      productId: string;
      file: File;
      idempotencyKey: string;
    }) => productsApi.uploadImage(liveId, productId, file, idempotencyKey),
    onSuccess: async (result: ProductImageUploadResult, { liveId, productId, idempotencyKey }) => {
      await Promise.all([
        updateProductAfterImageMutation(queryClient, result.product, liveId),
        queryClient.invalidateQueries({
          queryKey: productImageUploadsQueryKey(liveId, productId),
          exact: true,
        }),
        queryClient.invalidateQueries({
          queryKey: productImageUploadStatusQueryKey(liveId, idempotencyKey),
          exact: true,
        }),
      ]);
    },
  });
}

export function useSelectPrimaryProductImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ liveId, productId, imageId }: { liveId: string; productId: string; imageId: string }) =>
      productsApi.selectPrimaryImage(liveId, productId, imageId),
    onSuccess: async (updatedProduct, { liveId }) =>
      updateProductAfterImageMutation(queryClient, updatedProduct, liveId),
  });
}

export function useRemoveProductImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ liveId, productId, imageId }: { liveId: string; productId: string; imageId: string }) =>
      productsApi.removeImage(liveId, productId, imageId),
    onSuccess: async (updatedProduct, { liveId }) => {
      await updateProductAfterImageMutation(queryClient, updatedProduct, liveId);
    },
  });
}
