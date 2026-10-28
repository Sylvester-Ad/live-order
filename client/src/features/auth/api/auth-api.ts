import type { components } from "../../../types/openapi.generated";
import { api } from "../../../lib/api-client";

export type Creator = components["schemas"]["CreatorResponse"];

export const authApi = {
  currentCreator(signal?: AbortSignal) {
    return api.get<Creator>("/v1/creator/me", { signal });
  },
  login(accessCode: string, signal?: AbortSignal) {
    return api.post<Creator>("/v1/creator/access", { accessCode }, { signal });
  },
  logout(signal?: AbortSignal) {
    return api.post<void>("/v1/creator/logout", undefined, { signal });
  },
};
