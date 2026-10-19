import type { components } from "../../../types/openapi.generated";
import { api } from "../../../lib/api-client";

export type CreateCustomerOrderInput = components["schemas"]["CreateOrderRequest"];
export type CreatedCustomerOrder = components["schemas"]["OrderResponse"];

export const customerOrdersApi = {
  create(liveId: string, input: CreateCustomerOrderInput, idempotencyKey: string) {
    return api.post<CreatedCustomerOrder>(
      `/v1/lives/${encodeURIComponent(liveId)}/orders`,
      input,
      { headers: { "Idempotency-Key": idempotencyKey } },
    );
  },
};
