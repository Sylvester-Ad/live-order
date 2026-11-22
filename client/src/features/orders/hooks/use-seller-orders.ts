import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { sellerOrdersApi } from "../api/seller-orders-api";

export const sellerOrdersQueryKey = (storeId: string) => ["stores", storeId, "orders"] as const;
export const sellerOrdersPageQueryKey = (storeId: string, page: number, limit: number) =>
  [...sellerOrdersQueryKey(storeId), { page, limit }] as const;

export function useSellerOrders(storeId: string, page: number, limit: number, enabled = true) {
  return useQuery({
    queryKey: sellerOrdersPageQueryKey(storeId, page, limit),
    queryFn: ({ signal }) => sellerOrdersApi.list(storeId, page, limit, signal),
    enabled: Boolean(storeId) && enabled,
  });
}

export function useSellerOrder(storeId: string, orderId: string | undefined) {
  return useQuery({
    queryKey: [...sellerOrdersQueryKey(storeId), "detail", orderId],
    queryFn: ({ signal }) => sellerOrdersApi.get(storeId, orderId!, signal),
    enabled: Boolean(storeId && orderId),
  });
}

export function useMarkOrderPaid(storeId: string) {
  const queryClient = useQueryClient();
  const queryKey = sellerOrdersQueryKey(storeId);

  return useMutation({
    mutationFn: (orderId: string) => sellerOrdersApi.markPaid(storeId, orderId, { paymentStatus: "PAID" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });
}

export function useExportOrdersCsv() {
  return useMutation({
    mutationFn: (storeId: string) => sellerOrdersApi.exportCsv(storeId),
  });
}
