import { useQuery } from "@tanstack/react-query";

import { publicLiveApi } from "../api/public-live-api";

export const publicLiveQueryKey = (slug?: string) =>
  slug ? ["public-live", slug] as const : ["public-live"] as const;

export function usePublicLive(slug: string) {
  return useQuery({
    queryKey: publicLiveQueryKey(slug),
    queryFn: ({ signal }) => publicLiveApi.getBySlug(slug, signal),
    retry: false,
    refetchOnMount: "always",
  });
}
