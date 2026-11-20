import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomic, exists } from "./config";
import type { Control } from "./service";
export function startScheduler(control: Control) {
  const pending = new Set<string>();
  const timer = setInterval(async () => {
    try {
      const now = new Date();
      const day = now.toISOString().slice(0, 10),
        time = now.toISOString().slice(11, 16);
      for (const server of await control.store.list()) {
        const schedule = await control.management.schedule(server.name);
        const marker = join(
          await control.store.folder(server.name),
          "schedule-success.json",
        );
        const last: Record<string, string> = (await exists(marker))
          ? JSON.parse(await readFile(marker, "utf8"))
          : {};
        for (const [setting, verb] of [
          ["restartAt", "restart"],
          ["backupAt", "backup-now"],
        ] as const) {
          const key = server.name + ":" + setting + ":" + day;
          if (
            schedule[setting] !== time ||
            last[setting] === day ||
            pending.has(key)
          )
            continue;
          pending.add(key);
          control
            .dispatch({ verb, name: server.name })
            .then(async () => {
              const latest: Record<string, string> = (await exists(marker))
                ? JSON.parse(await readFile(marker, "utf8"))
                : {};
              latest[setting] = day;
              await atomic(marker, latest);
            })
            .catch(() => console.error("Scheduled Minecraft operation failed"))
            .finally(() => pending.delete(key));
        }
      }
    } catch {
      console.error("Minecraft schedule check failed");
    }
  }, 30000);
  timer.unref();
  return () => clearInterval(timer);
}
