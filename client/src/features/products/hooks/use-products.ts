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
export const productImageUploadsQueryKey = (storeId: string, productId: string) =>
  ["stores", storeId, "product-image-uploads", productId] as const;
export const productImageUploadStatusQueryKey = (storeId: string, idempotencyKey: string) =>
  ["stores", storeId, "product-image-upload-status", idempotencyKey] as const;

export function useProducts(
  storeId: string,
  options: { enabled?: boolean; refetchOnMount?: boolean | "always" } = {},
) {
  return useQuery({
    queryKey: productsQueryKey(storeId),
    queryFn: ({ signal }) => productsApi.list(storeId, signal),
    ...options,
    enabled: Boolean(storeId) && (options.enabled ?? true),
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
    mutationFn: ({ storeId, input, idempotencyKey }: {
      storeId: string;
      input: CreateProductInput;
      idempotencyKey: string;
    }) => productsApi.create(storeId, input, idempotencyKey),
    onSuccess: async (createdProduct, { storeId }) => {
      const queryKey = productsQueryKey(storeId);
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
    mutationFn: ({ storeId, productId }: { storeId: string; productId: string }) =>
      productsApi.delete(storeId, productId),
    onSuccess: async (_result, { storeId, productId }) => {
      const queryKey = productsQueryKey(storeId);
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
