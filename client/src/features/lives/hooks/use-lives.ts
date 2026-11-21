import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { storesApi, type Store, type UpdateStoreInput } from "../api/lives-api";

export const storesQueryKey = ["stores"] as const;

export function useStores(options: { refetchOnMount?: boolean | "always" } = {}) {
  return useQuery({
    queryKey: storesQueryKey,
    queryFn: ({ signal }) => storesApi.list(signal),
    ...options,
  });
}

function replaceStore(stores: Store[] | undefined, updatedStore: Store) {
  if (!stores) return stores;
  return stores.map((store) => store.id === updatedStore.id ? updatedStore : store);
}

function addStore(stores: Store[] | undefined, createdStore: Store) {
  if (!stores) return [createdStore];
  return [createdStore, ...stores.filter((store) => store.id !== createdStore.id)];
}

function useStoreMutation(mutationFn: (storeId: string) => Promise<Store>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (storeId: string) => mutationFn(storeId),
    onSuccess: async (updatedStore) => {
      queryClient.setQueryData<Store[]>(storesQueryKey, (stores) => replaceStore(stores, updatedStore));
      await queryClient.invalidateQueries({ queryKey: storesQueryKey });
    },
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: storesQueryKey });
    },
  });
}

export function useCreateStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: storesApi.create,
    onSuccess: async (createdStore) => {
      queryClient.setQueryData<Store[]>(storesQueryKey, (stores) => addStore(stores, createdStore));
      await queryClient.invalidateQueries({ queryKey: storesQueryKey });
    },
  });
}

export function useUpdateStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storeId, input }: { storeId: string; input: UpdateStoreInput }) => storesApi.update(storeId, input),
    onSuccess: async (updatedStore) => {
      queryClient.setQueryData<Store[]>(storesQueryKey, (stores) => replaceStore(stores, updatedStore));
      await queryClient.invalidateQueries({ queryKey: storesQueryKey });
    },
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: storesQueryKey });
    },
  });
}

export function usePublishStore() {
  return useStoreMutation(storesApi.publish);
}

export function useUnpublishStore() {
  return useStoreMutation(storesApi.unpublish);
}
