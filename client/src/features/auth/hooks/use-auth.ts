import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { authApi, type ClaimInput, type PasswordLoginInput, type PasswordResetInput, type RegistrationInput } from "../api/auth-api";

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
    mutationFn: (input: PasswordLoginInput) => authApi.passwordLogin(input),
    onSuccess: (creator) => {
      queryClient.setQueryData(creatorQueryKey, creator);
    },
  });
}

export function useRegisterSeller() {
  return useMutation({ mutationFn: (input: RegistrationInput) => authApi.register(input) });
}

export function useClaimSeller() {
  return useMutation({ mutationFn: (input: ClaimInput) => authApi.claim(input) });
}

export function useVerifySellerEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => authApi.verifyEmail({ token }),
    onSuccess: (creator) => queryClient.setQueryData(creatorQueryKey, creator),
  });
}

export function useRequestPasswordReset() {
  return useMutation({ mutationFn: (email: string) => authApi.requestPasswordReset({ email }) });
}

export function useResetSellerPassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PasswordResetInput) => authApi.resetPassword(input),
    onSuccess: async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
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
