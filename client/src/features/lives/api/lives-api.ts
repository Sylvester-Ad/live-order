import type { components } from "../../../types/openapi.generated";
import { api } from "../../../lib/api-client";

export type Store = components["schemas"]["StoreResponse"];
export type CreateStoreInput = components["schemas"]["CreateStoreRequest"];
export type UpdateStoreInput = components["schemas"]["UpdateStoreDetailsRequest"];

export const storesApi = {
  list(signal?: AbortSignal) {
    return api.get<Store[]>("/v1/stores", { signal });
  },
  create(input: CreateStoreInput) {
    return api.post<Store>("/v1/stores", input);
  },
  update(storeId: string, input: UpdateStoreInput) {
    return api.patch<Store>(`/v1/stores/${encodeURIComponent(storeId)}`, input);
  },
  publish(storeId: string) {
    return api.post<Store>(`/v1/stores/${encodeURIComponent(storeId)}/publish`);
  },
  unpublish(storeId: string) {
    return api.post<Store>(`/v1/stores/${encodeURIComponent(storeId)}/unpublish`);
  },
};
