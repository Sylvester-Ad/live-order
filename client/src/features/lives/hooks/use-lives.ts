import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { livesApi, type Live, type UpdateLiveInput } from "../api/lives-api";

export const livesQueryKey = ["lives"] as const;

export function useLives(options: { refetchOnMount?: boolean | "always" } = {}) {
  return useQuery({
    queryKey: livesQueryKey,
    queryFn: ({ signal }) => livesApi.list(signal),
    ...options,
  });
}

function replaceLive(lives: Live[] | undefined, updatedLive: Live) {
  if (!lives) return lives;
  return lives.map((live) => live.id === updatedLive.id ? updatedLive : live);
}

function addLive(lives: Live[] | undefined, createdLive: Live) {
  if (!lives) return [createdLive];
  return [createdLive, ...lives.filter((live) => live.id !== createdLive.id)];
}

export function useCreateLive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: livesApi.create,
    onSuccess: async (createdLive) => {
      queryClient.setQueryData<Live[]>(livesQueryKey, (lives) => addLive(lives, createdLive));
      await queryClient.invalidateQueries({ queryKey: livesQueryKey });
    },
  });
}

export function useUpdateLive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ liveId, input }: { liveId: string; input: UpdateLiveInput }) =>
      livesApi.update(liveId, input),
    onSuccess: async (updatedLive) => {
      queryClient.setQueryData<Live[]>(livesQueryKey, (lives) => replaceLive(lives, updatedLive));
      await queryClient.invalidateQueries({ queryKey: livesQueryKey });
    },
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: livesQueryKey });
    },
  });
}
