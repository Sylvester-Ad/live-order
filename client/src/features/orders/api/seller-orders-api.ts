import type { components } from "../../../types/openapi.generated";
import { api } from "../../../lib/api-client";

export type SellerOrder = components["schemas"]["StoreOrderResponse"];
export type UpdateOrderInput = components["schemas"]["UpdateOrderRequest"];
export type SellerOrdersPage = components["schemas"]["PaginatedStoreOrdersSuccessResponse"];

export const sellerOrdersApi = {
  list(storeId: string, page: number, limit: number, signal?: AbortSignal) {
    const query = new URLSearchParams({ page: String(page), limit: String(limit) });
    return api.get<SellerOrdersPage>(`/v1/stores/${encodeURIComponent(storeId)}/orders?${query}`, { signal });
  },
  get(storeId: string, orderId: string, signal?: AbortSignal) {
    return api.get<SellerOrder>(`/v1/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(orderId)}`, { signal });
  },
  markPaid(storeId: string, orderId: string, input: UpdateOrderInput) {
    return api.patch<SellerOrder>(`/v1/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(orderId)}`, input);
  },
  exportCsv(storeId: string) {
    return api.get<Blob>(`/v1/stores/${encodeURIComponent(storeId)}/orders/export`, { responseType: "blob" });
  },
};
