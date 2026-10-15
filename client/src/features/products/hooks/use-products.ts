import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { productsApi, type CreateProductInput, type Product, type UpdateProductInput } from "../api/products-api";

export const productsQueryKey = (liveId: string) => ["products", liveId] as const;

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

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ liveId, input }: { liveId: string; input: CreateProductInput }) =>
      productsApi.create(liveId, input),
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
