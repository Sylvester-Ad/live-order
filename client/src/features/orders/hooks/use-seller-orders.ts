import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { sellerOrdersApi, type SellerOrder } from "../api/seller-orders-api";

export const sellerOrdersQueryKey = (liveId: string) => ["orders", liveId] as const;

export function useSellerOrders(liveId: string) {
  return useQuery({
    queryKey: sellerOrdersQueryKey(liveId),
    queryFn: ({ signal }) => sellerOrdersApi.list(liveId, signal),
    enabled: Boolean(liveId),
  });
}

export function useMarkOrderPaid(liveId: string) {
  const queryClient = useQueryClient();
  const queryKey = sellerOrdersQueryKey(liveId);

  return useMutation({
    mutationFn: (orderId: string) => sellerOrdersApi.markPaid(orderId, { paymentStatus: "PAID" }),
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
    mutationFn: (liveId: string) => sellerOrdersApi.exportCsv(liveId),
  });
}
