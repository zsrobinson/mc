import { useQuery, useQueryClient } from "@tanstack/react-query";

import { serversQuery, statusQuery } from "./queries";

/** One server's live status, shown from the list cache until it arrives. */
export function useServer(name: string) {
  const queryClient = useQueryClient();
  return useQuery({
    ...statusQuery(name),
    placeholderData: () =>
      queryClient
        .getQueryData(serversQuery.queryKey)
        ?.find((server) => server.name === name),
  });
}
