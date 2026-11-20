import { serverState } from "../../../src/server-state";

export type StateTone = "on" | "busy" | "off" | "error";
const TONES: Record<ReturnType<typeof serverState>, StateTone> = {
  running: "on",
  starting: "busy",
  stopped: "off",
  crashed: "error",
};
const LABELS = {
  running: "Running",
  starting: "Starting",
  stopped: "Stopped",
  crashed: "Crashed",
} as const;
export function stateTone(state: string): StateTone {
  return TONES[serverState(state)];
}
export function stateLabel(state: string) {
  return LABELS[serverState(state)];
}
export const isRunning = (state: string) => serverState(state) === "running";
