import { useMutation } from "@tanstack/react-query";

import { customerOrdersApi, type CreateCustomerOrderInput } from "../api/orders-api";

export function useCreateCustomerOrder() {
  return useMutation({
    mutationFn: ({ storeId, input, idempotencyKey }: {
      storeId: string;
      input: CreateCustomerOrderInput;
      idempotencyKey: string;
    }) => customerOrdersApi.create(storeId, input, idempotencyKey),
  });
}
