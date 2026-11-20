export type ServerState = "running" | "starting" | "stopped" | "crashed";
export type ServerStateInfo = {
  state: string;
  health?: string | { Status?: string };
  players?: string | null;
  metrics?: { tps?: number | null; mspt?: number | null };
};

/** Docker process state alone does not mean Minecraft has finished starting. */
export function serverState(input: string | ServerStateInfo): ServerState {
  const info = typeof input === "string" ? { state: input } : input;
  const state = info.state.toLowerCase();
  const health =
    typeof info.health === "string" ? info.health : info.health?.Status;
  if (["crashed", "dead", "unhealthy", "error"].includes(state))
    return "crashed";
  if (["starting", "restarting", "creating"].includes(state)) return "starting";
  if (state !== "running") return "stopped";
  if (health === "starting") return "starting";
  if (health === "unhealthy") return "crashed";
  if (health === "healthy") return "running";
  // Older helpers expose readiness through RCON, the same signal waitReady uses.
  // A successful optional tick probe also establishes readiness when the cached
  // player-list probe failed. Undefined means the producer supplied no evidence.
  if (
    info.players !== undefined &&
    !/players online/i.test(info.players ?? "") &&
    info.metrics?.tps == null &&
    info.metrics?.mspt == null
  )
    return "starting";
  return "running";
}

/** Normalize helper server records at the panel boundary, including power replies. */
export function normalizeServerRecords(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeServerRecords);
  if (
    value &&
    typeof value === "object" &&
    "state" in value &&
    typeof value.state === "string"
  )
    return { ...value, state: serverState(value as ServerStateInfo) };
  return value;
}
