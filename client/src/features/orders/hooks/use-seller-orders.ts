import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { sellerOrdersApi, type SellerOrder } from "../api/seller-orders-api";

export const sellerOrdersQueryKey = (storeId: string) => ["stores", storeId, "orders"] as const;

export function useSellerOrders(storeId: string) {
  return useQuery({
    queryKey: sellerOrdersQueryKey(storeId),
    queryFn: ({ signal }) => sellerOrdersApi.list(storeId, signal),
    enabled: Boolean(storeId),
  });
}

export function useMarkOrderPaid(storeId: string) {
  const queryClient = useQueryClient();
  const queryKey = sellerOrdersQueryKey(storeId);

  return useMutation({
    mutationFn: (orderId: string) => sellerOrdersApi.markPaid(storeId, orderId, { paymentStatus: "PAID" }),
    onSuccess: async (updatedOrder) => {
      queryClient.setQueryData<SellerOrder[]>(queryKey, (orders) =>
        orders?.map((order) => order.id === updatedOrder.id ? updatedOrder : order),
      );
      await queryClient.invalidateQueries({ queryKey, exact: true });
    },
  });
}

export function useExportOrdersCsv() {
  return useMutation({
    mutationFn: (storeId: string) => sellerOrdersApi.exportCsv(storeId),
  });
}
