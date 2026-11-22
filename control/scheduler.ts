import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomic, exists } from "./config";
import { dueDate, type Task } from "./tasks";
import type { Control } from "./service";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Runs one task through the serialized control path with the "schedule" actor. */
export async function runTask(control: Control, server: string, task: Task) {
  if (task.kind === "backup")
    return control.run({ verb: "backup-now", name: server, payload: { reason: "manual" } }, "schedule");
  if (task.kind === "command")
    return control.run({ verb: "rcon", name: server, payload: { command: task.command! } }, "schedule");
  if (task.kind === "announce")
    return control.run({ verb: "rcon", name: server, payload: { command: "say " + task.message! } }, "schedule");
  const warn = task.warnMinutes ?? 0;
  if (warn > 0 && (await control.docker.container(server, true))?.State.Running) {
    // Announce at the lead time and at 10/5/1 minutes, restarting on schedule.
    const marks = [...new Set([warn, ...[10, 5, 1].filter((m) => m < warn)])];
    let elapsed = 0;
    for (const left of marks) {
      await sleep((warn - left) * 60000 - elapsed);
      elapsed = (warn - left) * 60000;
      await control.docker
        .rcon(server, `say Server restarts in ${left} minute${left === 1 ? "" : "s"}.`)
        .catch(() => undefined);
    }
    await sleep(warn * 60000 - elapsed);
  }
  return control.run({ verb: "restart", name: server }, "schedule");
}

/**
 * Every 30 seconds: start due tasks, and record unexpected container exits or
 * restart-policy restarts in the activity log. Never starts or stops servers
 * except through an enabled task.
 */
export function startScheduler(control: Control) {
  const pending = new Set<string>();
  const tick = async () => {
    try {
      for (const server of await control.store.list()) {
        await detectCrash(control, server.name).catch(() => undefined);
        for (const task of await control.tasks.list(server.name)) {
          const date = dueDate(task);
          const key = server.name + ":" + task.id + ":" + date;
          if (!date || pending.has(key)) continue;
          pending.add(key);
          await control.tasks.update(server.name, task.id, { firedFor: date });
          runTask(control, server.name, task)
            .then(() =>
              control.tasks.update(server.name, task.id, {
                lastRun: { at: new Date().toISOString(), ok: true },
              }),
            )
            .catch((e) =>
              control.tasks.update(server.name, task.id, {
                lastRun: {
                  at: new Date().toISOString(),
                  ok: false,
                  error: e instanceof Error ? e.message.slice(0, 200) : "Task failed",
                },
              }),
            )
            .finally(() => setTimeout(() => pending.delete(key), 120000));
        }
      }
    } catch {
      console.error("Minecraft schedule check failed");
    }
  };
  const timer = setInterval(tick, 30000);
  timer.unref();
  return () => clearInterval(timer);
}

/** Records a crash once per container exit or policy restart. */
export async function detectCrash(control: Control, name: string) {
  const info = await control.docker.container(name, true);
  if (!info) return;
  const file = join(await control.store.folder(name), "crash-monitor.json");
  const seen: { restartCount?: number; finishedAt?: string } = (await exists(file))
    ? JSON.parse(await readFile(file, "utf8"))
    : {};
  const restarts = info.RestartCount ?? 0;
  const exited =
    !info.State.Running &&
    info.State.ExitCode !== undefined &&
    info.State.ExitCode !== 0 &&
    info.State.FinishedAt;
  const firstLook = seen.restartCount === undefined;
  const events: string[] = [];
  if (!firstLook && restarts > (seen.restartCount ?? 0))
    events.push(`restarted automatically after an unexpected exit (restart ${restarts})`);
  if (!firstLook && exited && info.State.FinishedAt !== seen.finishedAt)
    events.push(
      `exit code ${info.State.ExitCode}` + (info.State.OOMKilled ? " · out of memory" : ""),
    );
  if (
    firstLook ||
    restarts !== seen.restartCount ||
    (exited && info.State.FinishedAt !== seen.finishedAt)
  )
    await atomic(file, {
      restartCount: restarts,
      finishedAt: exited ? info.State.FinishedAt : seen.finishedAt,
    });
  for (const detail of events)
    await control.audit.record({
      actor: "monitor",
      verb: "crash-detected",
      server: name,
      outcome: "error",
      durationMs: 0,
      detail,
    });
  return events;
}
