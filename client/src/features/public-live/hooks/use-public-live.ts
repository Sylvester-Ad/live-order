import { useQuery } from "@tanstack/react-query";

import { publicLiveApi } from "../api/public-live-api";

export function usePublicLive(slug: string) {
  return useQuery({
    queryKey: ["public-live", slug],
    queryFn: ({ signal }) => publicLiveApi.getBySlug(slug, signal),
    retry: false,
    refetchOnMount: "always",
  });
}
