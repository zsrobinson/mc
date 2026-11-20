import type { Limits, Server } from "./types";

/** Each container is limited to its heap plus this overhead, in MiB. */
export const CONTAINER_OVERHEAD_MIB = 512;

export function allocatedMiB(servers: Pick<Server, "memory">[]) {
  return servers.reduce(
    (sum, server) => sum + server.memory + CONTAINER_OVERHEAD_MIB,
    0,
  );
}

/** Largest heap a new or resized server can have within the shared budget. */
export function availableHeapMiB(
  limits: Limits,
  servers: Pick<Server, "name" | "memory">[],
  excluding?: string,
) {
  const others = servers.filter((server) => server.name !== excluding);
  return Math.max(
    0,
    limits.memoryBudget - allocatedMiB(others) - CONTAINER_OVERHEAD_MIB,
  );
}
