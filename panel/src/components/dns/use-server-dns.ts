import { useQuery } from "@tanstack/react-query";

import { dnsQuery } from "@/lib/queries";
import type { Server, ServerDns } from "@/lib/types";

/** The freshest DNS status: dns-status when available, else the status field. */
export function useServerDns(server: Server): {
  dns: ServerDns | undefined;
  checking: boolean;
  recheck: () => void;
} {
  const query = useQuery(dnsQuery(server.name));
  return {
    dns: query.data ?? server.dns,
    checking: query.isFetching,
    recheck: () => void query.refetch(),
  };
}

export const needsFix = (dns: ServerDns | undefined) =>
  dns?.status === "missing" || dns?.status === "drifted";
