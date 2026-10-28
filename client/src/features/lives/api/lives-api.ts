import type { components } from "../../../types/openapi.generated";
import { api } from "../../../lib/api-client";

export type Live = components["schemas"]["LiveResponse"];
export type CreateLiveInput = components["schemas"]["CreateLiveRequest"];
export type UpdateLiveInput = components["schemas"]["UpdateLiveRequest"];

export const livesApi = {
  list(signal?: AbortSignal) {
    return api.get<Live[]>("/v1/lives", { signal });
  },
  create(input: CreateLiveInput) {
    return api.post<Live>("/v1/lives", input);
  },
  update(liveId: string, input: UpdateLiveInput) {
    return api.patch<Live>(`/v1/lives/${encodeURIComponent(liveId)}`, input);
  },
};
