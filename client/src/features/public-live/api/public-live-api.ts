import type { components } from "../../../types/openapi.generated";
import { api } from "../../../lib/api-client";

export type PublicStorefront = components["schemas"]["PublicStoreResponse"];

export const publicLiveApi = {
  getBySlug(slug: string, signal?: AbortSignal) {
    return api.get<PublicStorefront>(`/v1/public/stores/${encodeURIComponent(slug)}`, {
      signal,
    });
  },
};
