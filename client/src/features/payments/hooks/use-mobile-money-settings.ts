import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { mobileMoneyApi, type UpdateMobileMoneySettingsInput } from "../api/mobile-money-api";

export const mobileMoneySettingsQueryKey = (storeId: string) => ["stores", storeId, "mobile-money-settings"] as const;

export function useMobileMoneySettings(storeId: string) {
  return useQuery({
    queryKey: mobileMoneySettingsQueryKey(storeId),
    queryFn: ({ signal }) => mobileMoneyApi.getSettings(storeId, signal),
    enabled: Boolean(storeId),
    retry: false,
  });
}

export function useSaveMobileMoneySettings(storeId: string) {
  const queryClient = useQueryClient();
  const queryKey = mobileMoneySettingsQueryKey(storeId);
  return useMutation({
    mutationFn: (input: UpdateMobileMoneySettingsInput) => mobileMoneyApi.saveSettings(storeId, input),
    onSuccess: async (settings) => {
      queryClient.setQueryData(queryKey, settings);
      await queryClient.invalidateQueries({ queryKey, exact: true });
    },
  });
}
