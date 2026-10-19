import { useMutation } from "@tanstack/react-query";

import { customerOrdersApi, type CreateCustomerOrderInput } from "../api/orders-api";

export function useCreateCustomerOrder() {
  return useMutation({
    mutationFn: ({ liveId, input, idempotencyKey }: {
      liveId: string;
      input: CreateCustomerOrderInput;
      idempotencyKey: string;
    }) => customerOrdersApi.create(liveId, input, idempotencyKey),
  });
}
