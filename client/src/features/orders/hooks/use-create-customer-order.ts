import { useMutation } from "@tanstack/react-query";

import { customerOrdersApi, type CreateCustomerOrderInput } from "../api/orders-api";

export function useCreateCustomerOrder() {
  return useMutation({
    mutationFn: ({ liveId, input }: { liveId: string; input: CreateCustomerOrderInput }) =>
      customerOrdersApi.create(liveId, input),
  });
}
