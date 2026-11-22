import type { components } from "../../../types/openapi.generated";
import { api } from "../../../lib/api-client";

export type MobileMoneyProvider = components["schemas"]["UpdateMobileMoneySettingsRequest"]["provider"];
export type MobileMoneySettings = components["schemas"]["MobileMoneySettingsResponse"];
export type UpdateMobileMoneySettingsInput = components["schemas"]["UpdateMobileMoneySettingsRequest"];

export const mobileMoneyApi = {
  getSettings(storeId: string, signal?: AbortSignal) {
    return api.get<MobileMoneySettings | null>(`/v1/stores/${encodeURIComponent(storeId)}/mobile-money`, { signal });
  },
  saveSettings(storeId: string, input: UpdateMobileMoneySettingsInput) {
    return api.put<MobileMoneySettings>(`/v1/stores/${encodeURIComponent(storeId)}/mobile-money`, input);
  },
};
