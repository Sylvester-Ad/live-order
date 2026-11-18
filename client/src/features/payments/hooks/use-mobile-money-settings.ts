import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { mobileMoneyApi, type UpdateMobileMoneySettingsInput } from "../api/mobile-money-api";

export const mobileMoneySettingsQueryKey = ["creator", "mobile-money-settings"] as const;

export function useMobileMoneySettings() {
  return useQuery({
    queryKey: mobileMoneySettingsQueryKey,
    queryFn: ({ signal }) => mobileMoneyApi.getSettings(signal),
    retry: false,
  });
}

export function useSaveMobileMoneySettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateMobileMoneySettingsInput) => mobileMoneyApi.saveSettings(input),
    onSuccess: (settings) => {
      queryClient.setQueryData(mobileMoneySettingsQueryKey, settings);
    },
  });
}
