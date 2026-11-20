import { readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { Control } from "./service";
import { exists } from "./config";
export async function metadata(
  component: "helper" | "panel" | "server",
  event: "operation" | "http" | "container_log_summary" | "state",
  values: Record<string, unknown> = {},
) {
  const endpoint = process.env.MC_LOKI_URL;
  if (!endpoint) return;
  const safe: Record<string, string | number | boolean> = { event };
  for (const key of [
    "durationMs",
    "status",
    "tailLines",
    "errors",
    "warnings",
    "up",
  ]) {
    const value = values[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0)
      safe[key] = value;
  }
  if (typeof values.verb === "string" && /^[a-z-]{1,40}$/.test(values.verb))
    safe.verb = values.verb;
  if (values.outcome === "ok" || values.outcome === "error")
    safe.outcome = values.outcome;
  const labels: Record<string, string> = {
    service_name: "minecraft",
    component,
  };
  if (
    typeof values.server === "string" &&
    /^[a-z][a-z0-9-]{0,23}$/.test(values.server)
  )
    labels.server = values.server;
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        streams: [
          {
            stream: labels,
            values: [
              [String(BigInt(Date.now()) * 1_000_000n), JSON.stringify(safe)],
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* Telemetry never blocks a control operation. */
  }
}
type Point = {
  attributes: { key: string; value: { stringValue: string } }[];
  timeUnixNano: string;
  asDouble: number;
};
export function startTelemetry(control: Control) {
  let busy = false;
  const fingerprints = new Map<string, string>();
  const sample = async () => {
    if (busy) return;
    busy = true;
    try {
      const servers = await (async () => {
        const result = [];
        for (const config of await control.store.list())
          result.push(await control.status(config));
        return result;
      })();
      const metrics = new Map<string, Point[]>();
      const nano = String(BigInt(Date.now()) * 1_000_000n);
      const point = (
        metric: string,
        value: number | null | undefined,
        server: string,
        location?: string,
      ) => {
        if (typeof value !== "number" || !Number.isFinite(value)) return;
        const labels = {
          host: process.env.MC_OBS_HOST || "local",
          server,
          ...(location ? { location } : {}),
        };
        const points = metrics.get(metric) || [];
        points.push({
          attributes: Object.entries(labels).map(([key, stringValue]) => ({
            key,
            value: { stringValue },
          })),
          timeUnixNano: nano,
          asDouble: value,
        });
        metrics.set(metric, points);
      };
      let ok = true;
      for (const server of servers) {
        const dir = await control.store.folder(server.name);
        const desiredPath = join(dir, "desired-state.json");
        const desired = (await exists(desiredPath))
          ? JSON.parse(await readFile(desiredPath, "utf8")).running !== false
          : true;
        const up = server.state === "running";
        point("minecraft_server_up", Number(up), server.name);
        point("minecraft_server_desired_up", Number(desired), server.name);
        point(
          "minecraft_players_online",
          server.players
            ? Number(server.players.match(/There are (\d+)/)?.[1] ?? 0)
            : null,
          server.name,
        );
        for (const [metric, key] of [
          ["uptime_seconds", "uptimeSeconds"],
          ["cpu_percent", "cpuPercent"],
          ["memory_bytes", "memoryBytes"],
          ["memory_limit_bytes", "memoryLimitBytes"],
          ["tick_tps", "tps"],
          ["tick_mspt", "mspt"],
        ] as const)
          point(
            "minecraft_server_" + metric,
            server.metrics?.[key],
            server.name,
          );
        point(
          "minecraft_server_cpu_limit_percent",
          (server.metrics?.cpuLimit ?? control.docker.cpus) * 100,
          server.name,
        );
        if (desired && !up) ok = false;
        const backupPath = join(dir, "backup-location-state.json");
        const locations: Record<
          string,
          { lastAttempt: number; success: boolean; lastSuccess: number }
        > = (await exists(backupPath))
          ? JSON.parse(await readFile(backupPath, "utf8"))
          : {};
        for (const target of control.backups.targets) {
          const state = locations[target.host];
          point(
            "minecraft_backup_last_success_unixtime",
            state?.lastSuccess ?? 0,
            server.name,
            target.label ?? target.host,
          );
          point(
            "minecraft_backup_last_attempt_success",
            state ? Number(state.success) : 0,
            server.name,
            target.label ?? target.host,
          );
          point(
            "minecraft_backup_last_attempt_unixtime",
            state?.lastAttempt ?? 0,
            server.name,
            target.label ?? target.host,
          );
          if (
            !state ||
            !state.success ||
            Date.now() / 1000 - state.lastSuccess > 129600
          )
            ok = false;
        }
        const restorePath = join(dir, "restore-test.json");
        if (await exists(restorePath)) {
          const restored = JSON.parse(await readFile(restorePath, "utf8"));
          point(
            "minecraft_restore_test_last_unixtime",
            restored.at,
            server.name,
          );
          point(
            "minecraft_restore_test_success",
            Number(restored.ok === true),
            server.name,
          );
        }
        if (up) {
          try {
            const logs = await control.docker.logs(server.name);
            const hash = createHash("sha256").update(logs).digest("hex");
            if (hash !== fingerprints.get(server.name)) {
              fingerprints.set(server.name, hash);
              const lines = logs.split("\n").filter(Boolean);
              void metadata("server", "container_log_summary", {
                server: server.name,
                tailLines: lines.length,
                errors: lines.filter((l) => /\/(?:ERROR|FATAL)\]/.test(l))
                  .length,
                warnings: lines.filter((l) => /\/WARN\]/.test(l)).length,
              });
            }
          } catch {
            /* Local console logs remain private. */
          }
        }
        void metadata("server", "state", {
          server: server.name,
          up: Number(up),
        });
      }
      const endpoint = process.env.MC_PROMETHEUS_OTLP_URL;
      if (endpoint) {
        const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resourceMetrics: [
              {
                resource: {
                  attributes: [
                    {
                      key: "service.name",
                      value: { stringValue: "minecraft" },
                    },
                    {
                      key: "host.name",
                      value: {
                        stringValue: process.env.MC_OBS_HOST || "local",
                      },
                    },
                  ],
                },
                scopeMetrics: [
                  {
                    scope: { name: "mc-control" },
                    metrics: [...metrics].map(([name, dataPoints]) => ({
                      name,
                      gauge: { dataPoints },
                    })),
                  },
                ],
              },
            ],
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) console.error("Minecraft metric export failed");
      }
      if (process.env.MC_OBS_HEALTH_FILE) {
        const path = process.env.MC_OBS_HEALTH_FILE;
        try {
          await writeFile(
            path + ".tmp",
            JSON.stringify({ at: Date.now() / 1000, ok }),
            { mode: 0o644 },
          );
          await rename(path + ".tmp", path);
        } catch {
          /* Root-owned health directory is provisioned separately. */
        }
      }
    } catch {
      console.error("Minecraft telemetry sample failed");
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => void sample(), 60000);
  timer.unref();
  void sample();
  return () => clearInterval(timer);
}
