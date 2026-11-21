import type { components } from "../../../types/openapi.generated";
import { api } from "../../../lib/api-client";

export type SellerOrder = components["schemas"]["StoreOrderResponse"];
export type UpdateOrderInput = components["schemas"]["UpdateOrderRequest"];

export const sellerOrdersApi = {
  list(storeId: string, signal?: AbortSignal) {
    return api.get<SellerOrder[]>(`/v1/stores/${encodeURIComponent(storeId)}/orders`, { signal });
  },
  markPaid(storeId: string, orderId: string, input: UpdateOrderInput) {
    return api.patch<SellerOrder>(`/v1/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(orderId)}`, input);
  },
  exportCsv(storeId: string) {
    return api.get<Blob>(`/v1/stores/${encodeURIComponent(storeId)}/orders/export`, { responseType: "blob" });
  },
};
