import type { components } from "../../../types/openapi.generated";
import { api } from "../../../lib/api-client";

export type SellerOrder = components["schemas"]["OrderResponse"];
export type UpdateOrderInput = components["schemas"]["UpdateOrderRequest"];

export const sellerOrdersApi = {
  list(liveId: string, signal?: AbortSignal) {
    return api.get<SellerOrder[]>(`/v1/lives/${encodeURIComponent(liveId)}/orders`, { signal });
  },
  markPaid(orderId: string, input: UpdateOrderInput) {
    return api.patch<SellerOrder>(`/v1/orders/${encodeURIComponent(orderId)}`, input);
  },
  exportCsv(liveId: string) {
    return api.get<Blob>(`/v1/lives/${encodeURIComponent(liveId)}/orders/export`, { responseType: "blob" });
  },
};
