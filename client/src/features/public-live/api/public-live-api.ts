import type { components } from "../../../types/openapi.generated";
import { api } from "../../../lib/api-client";

export type PublicLive = components["schemas"]["PublicLiveResponse"];

export const publicLiveApi = {
  getBySlug(slug: string, signal?: AbortSignal) {
    return api.get<PublicLive>(`/v1/public/lives/${encodeURIComponent(slug)}`, {
      signal,
    });
  },
};
