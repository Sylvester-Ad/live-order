import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { authApi } from "../api/auth-api";

export const creatorQueryKey = ["creator", "session"] as const;

export function useCurrentCreator() {
  return useQuery({
    queryKey: creatorQueryKey,
    queryFn: ({ signal }) => authApi.currentCreator(signal),
    staleTime: 30_000,
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (accessCode: string) => authApi.login(accessCode),
    onSuccess: (creator) => {
      queryClient.setQueryData(creatorQueryKey, creator);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
    },
  });
}
