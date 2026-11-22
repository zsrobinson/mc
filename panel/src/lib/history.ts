import { useQuery } from "@tanstack/react-query";
import { getJson } from "./api";
import type {
  ChartPoint,
  ChartRange,
} from "@zsrobinson/shell/blocks/chart-card";
export type History = {
  start?: number;
  end?: number;
  step?: number;
  /** The panel has no metrics source right now; series is empty. */
  unavailable?: boolean;
  series: Record<
    string,
    { metric: Record<string, string>; values: [number, string][] }[]
  >;
};
export function useHistory(range: ChartRange, server?: string) {
  return useQuery({
    queryKey: ["history", range, server],
    queryFn: ({ signal }) =>
      getJson<History>(
        "/api/history?" +
          new URLSearchParams({ range, ...(server ? { server } : {}) }),
        signal,
      ),
    staleTime: 15000,
    refetchInterval: 30000,
  });
}
export function serverColor(name: string) {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return `var(--chart-${(hash % 5) + 1})`;
}
export function historyPoints(
  history: History | undefined,
  metric: string,
  names: string[],
): ChartPoint[] {
  const points = new Map<number, ChartPoint>();
  if (
    history?.start != null &&
    history.end != null &&
    history.step &&
    history.step > 0
  ) {
    for (let time = history.start; time <= history.end; time += history.step)
      points.set(time, {
        time,
        ...Object.fromEntries(names.map((name) => [name, null])),
      });
  }
  for (const s of history?.series[metric] ?? []) {
    const name = s.metric.server;
    if (!names.includes(name)) continue;
    for (const [time, value] of s.values) {
      const p = points.get(time) ?? { time };
      p[name] = Number.isFinite(Number(value)) ? Number(value) : null;
      points.set(time, p);
    }
  }
  return [...points.values()].sort((a, b) => a.time - b.time);
}
export const historyConfig = (names: string[]) =>
  Object.fromEntries(
    names.map((name) => [name, { label: name, color: serverColor(name) }]),
  );
