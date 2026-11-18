import type { components } from "../../../types/openapi.generated";
import { api } from "../../../lib/api-client";

export type MobileMoneyProvider = components["schemas"]["UpdateMobileMoneySettingsRequest"]["provider"];
export type MobileMoneySettings = components["schemas"]["MobileMoneySettingsResponse"];
export type UpdateMobileMoneySettingsInput = components["schemas"]["UpdateMobileMoneySettingsRequest"];

export const mobileMoneyApi = {
  getSettings(signal?: AbortSignal) {
    return api.get<MobileMoneySettings | null>("/v1/creator/mobile-money", { signal });
  },
  saveSettings(input: UpdateMobileMoneySettingsInput) {
    return api.put<MobileMoneySettings>("/v1/creator/mobile-money", input);
  },
};
