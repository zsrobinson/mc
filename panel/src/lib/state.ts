/** Container states reported by the control service, plus optimistic ones. */
export type StateTone = "on" | "busy" | "off" | "error";

const TRANSITIONAL = new Set([
  "starting",
  "stopping",
  "restarting",
  "creating",
  "removing",
]);
const FAILED = new Set(["dead", "unhealthy", "missing", "error"]);

export function stateTone(state: string): StateTone {
  if (state === "running") return "on";
  if (TRANSITIONAL.has(state)) return "busy";
  if (FAILED.has(state)) return "error";
  return "off";
}

const LABELS: Record<string, string> = {
  running: "Running",
  exited: "Stopped",
  created: "Stopped",
  paused: "Paused",
};

export function stateLabel(state: string) {
  return LABELS[state] ?? state.charAt(0).toUpperCase() + state.slice(1);
}

export const isRunning = (state: string) => state === "running";
