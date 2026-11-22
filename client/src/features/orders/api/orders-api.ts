import type { components } from "../../../types/openapi.generated";
import { api } from "../../../lib/api-client";

export type CreateCustomerOrderInput = components["schemas"]["CreateOrderRequest"];
export type CreatedCustomerOrder = components["schemas"]["StoreOrderResponse"];

export const customerOrdersApi = {
  create(storeId: string, input: CreateCustomerOrderInput, idempotencyKey: string) {
    return api.post<CreatedCustomerOrder>(
      `/v1/stores/${encodeURIComponent(storeId)}/orders`,
      input,
      { headers: { "Idempotency-Key": idempotencyKey } },
    );
  },
};
