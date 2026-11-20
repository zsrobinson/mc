import type { Hono, Env } from "hono";
import { helperResponse } from "./helper-client";
export const ranges = {
  "1h": [3600, 30],
  "24h": [86400, 300],
  "7d": [604800, 1800],
  "30d": [2592000, 7200],
} as const;
export const metrics = {
  up: "minecraft_server_up",
  players: "minecraft_players_online",
  mspt: "minecraft_server_tick_mspt",
  cpu: "minecraft_server_cpu_percent",
  memory: "minecraft_server_memory_bytes",
  memoryLimit: "minecraft_server_memory_limit_bytes",
  backup: "minecraft_backup_last_success_unixtime",
  requests: 'sum(rate(shell_http_requests_total{job="minecraft-panel"}[5m]))',
  errors:
    'sum(rate(shell_http_requests_total{job="minecraft-panel",status=~"5.."}[5m]))',
} as const;
type Series = { metric: Record<string, string>; values: [number, string][] };
export function mountHistory<E extends Env>(app: Hono<E>) {
  const cache = new Map<string, { at: number; data: unknown }>();
  app.get("/api/history", async (c) => {
    const range = c.req.query("range") ?? "24h",
      name = c.req.query("server");
    if (
      !Object.hasOwn(ranges, range) ||
      [...new URL(c.req.url).searchParams.keys()].some(
        (k) => !["range", "server"].includes(k),
      )
    )
      return c.json({ error: "Invalid history request" }, 400);
    if (name && !/^[a-z0-9][a-z0-9-]{0,31}$/.test(name))
      return c.json({ error: "Invalid server" }, 400);
    if (!process.env.PROMETHEUS_URL)
      return c.json({ error: "History is not configured" }, 503);
    try {
      const response = await helperResponse(
        "/",
        "POST",
        new Blob([JSON.stringify({ verb: "list", payload: {} })]).stream(),
        "application/json",
      );
      if (!response.ok) throw Error("Server list unavailable");
      const servers = (await response.json()) as { name: string }[];
      if (name && !servers.some((s) => s.name === name))
        return c.json({ error: "Unknown server" }, 404);
      const key = range + ":" + (name ?? "");
      const found = cache.get(key);
      if (found && Date.now() - found.at < 15000) return c.json(found.data);
      const [seconds, step] = ranges[range as keyof typeof ranges];
      const end = Math.floor(Date.now() / 1000 / step) * step;
      const entries = await Promise.all(
        Object.entries(metrics).map(async ([key, query]) => {
          const url = new URL(
            "api/v1/query_range",
            process.env.PROMETHEUS_URL!.replace(/\/?$/, "/"),
          );
          url.search = new URLSearchParams({
            query,
            start: String(end - seconds),
            end: String(end),
            step: String(step),
          }).toString();
          const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!r.ok) throw Error("History unavailable");
          const result = (await r.json()) as {
            status: string;
            data: { result: Series[] };
          };
          if (result.status !== "success") throw Error("History unavailable");
          const known = new Set(servers.map((s) => s.name));
          return [
            key,
            result.data.result
              .filter((s) =>
                key === "requests" || key === "errors"
                  ? !name
                  : known.has(s.metric.server) &&
                    (!name || s.metric.server === name),
              )
              .map((s) => ({
                ...s,
                values: s.values.map(([time, value]) => [time * 1000, value]),
              })),
          ];
        }),
      );
      const data = {
        range,
        start: (end - seconds) * 1000,
        end: end * 1000,
        step: step * 1000,
        timeUnit: "milliseconds",
        series: Object.fromEntries(entries),
      };
      if (cache.size > 100) cache.clear();
      cache.set(key, { at: Date.now(), data });
      return c.json(data);
    } catch {
      return c.json({ error: "History could not be loaded" }, 502);
    }
  });
}
