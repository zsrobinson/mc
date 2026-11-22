import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { atomic, exists, type ConfigStore } from "./config";

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (UTC)");
const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[^\r\n\0]*$/, "Use a single line");
export const taskInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    kind: z.enum(["restart", "backup", "command", "announce"]),
    time,
    days: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    enabled: z.boolean().default(true),
    command: line(200)
      .refine((c) => !c.startsWith("/"), "Leave out the leading slash")
      .optional(),
    message: line(200).optional(),
    warnMinutes: z.union([z.literal(0), z.literal(1), z.literal(5), z.literal(10), z.literal(15)]).optional(),
  })
  .strict()
  .superRefine((t, ctx) => {
    if (t.kind === "command" && !t.command)
      ctx.addIssue({ code: "custom", message: "A command task needs a command" });
    if (t.kind === "announce" && !t.message)
      ctx.addIssue({ code: "custom", message: "An announcement needs a message" });
  });
export type TaskInput = z.infer<typeof taskInputSchema>;
export type Task = TaskInput & {
  id: string;
  lastRun?: { at: string; ok: boolean; error?: string };
  /** Scheduled UTC date (YYYY-MM-DD) of the last fire, guarding double runs. */
  firedFor?: string;
};

/** Next run instant for a task, from `now` (ms). Null when disabled. */
export function nextRun(task: Pick<Task, "time" | "days" | "enabled">, now = Date.now()) {
  if (!task.enabled) return null;
  const [h, m] = task.time.split(":").map(Number);
  const start = new Date(now);
  for (let offset = 0; offset < 8; offset++) {
    const candidate = Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      start.getUTCDate() + offset,
      h,
      m,
    );
    const day = new Date(candidate).getUTCDay();
    if (candidate > now && (!task.days.length || task.days.includes(day)))
      return candidate;
  }
  return null;
}

/**
 * The task due at `now` (whole UTC minute), counting the warning lead for
 * restarts: a 05:00 restart with 5 warning minutes starts at 04:55.
 */
export function dueDate(task: Task, now = Date.now()) {
  if (!task.enabled) return null;
  const lead = task.kind === "restart" ? (task.warnMinutes ?? 0) : 0;
  const target = new Date(Math.floor(now / 60000) * 60000 + lead * 60000);
  const hhmm = target.toISOString().slice(11, 16);
  if (hhmm !== task.time) return null;
  if (task.days.length && !task.days.includes(target.getUTCDay())) return null;
  const date = target.toISOString().slice(0, 10);
  return task.firedFor === date ? null : date;
}

export class Tasks {
  constructor(readonly store: ConfigStore) {}
  private async files(name: string) {
    const dir = await this.store.folder(name);
    return { tasks: join(dir, "tasks.json"), legacy: join(dir, "schedule.json") };
  }
  /** Reads tasks, converting legacy restartAt/backupAt settings once. */
  async list(name: string): Promise<Task[]> {
    const f = await this.files(name);
    let tasks: Task[] = (await exists(f.tasks))
      ? JSON.parse(await readFile(f.tasks, "utf8"))
      : [];
    if (await exists(f.legacy)) {
      const legacy = JSON.parse(await readFile(f.legacy, "utf8")) as {
        restartAt?: string | null;
        backupAt?: string | null;
      };
      const migrated: Task[] = [];
      if (legacy.restartAt)
        migrated.push({ id: randomUUID(), kind: "restart", time: legacy.restartAt, days: [], enabled: true, warnMinutes: 0 });
      if (legacy.backupAt)
        migrated.push({ id: randomUUID(), kind: "backup", time: legacy.backupAt, days: [], enabled: true });
      if (migrated.length) {
        tasks = [...tasks, ...migrated];
        await atomic(f.tasks, tasks);
        await atomic(f.legacy, { restartAt: null, backupAt: null });
      }
    }
    return tasks;
  }
  async write(name: string, tasks: Task[]) {
    await atomic((await this.files(name)).tasks, tasks);
  }
  async save(name: string, input: unknown) {
    const parsed = taskInputSchema.parse(input);
    const tasks = await this.list(name);
    if (!parsed.id && tasks.length >= 20) throw Error("A server can have at most 20 tasks");
    const clean: Task = {
      ...parsed,
      id: parsed.id ?? randomUUID(),
      command: parsed.kind === "command" ? parsed.command : undefined,
      message: parsed.kind === "announce" ? parsed.message : undefined,
      warnMinutes: parsed.kind === "restart" ? (parsed.warnMinutes ?? 0) : undefined,
      days: [...new Set(parsed.days)].sort(),
    };
    const index = tasks.findIndex((t) => t.id === clean.id);
    if (parsed.id && index < 0) throw Error("Task not found");
    if (index >= 0) {
      const previous = tasks[index];
      tasks[index] = { ...clean, lastRun: previous.lastRun, firedFor: previous.firedFor };
    } else tasks.push(clean);
    await this.write(name, tasks);
    return this.view(tasks.find((t) => t.id === clean.id)!);
  }
  async remove(name: string, id: string) {
    const tasks = await this.list(name);
    if (!tasks.some((t) => t.id === id)) throw Error("Task not found");
    await this.write(name, tasks.filter((t) => t.id !== id));
    return { deleted: true };
  }
  async get(name: string, id: string) {
    const task = (await this.list(name)).find((t) => t.id === id);
    if (!task) throw Error("Task not found");
    return task;
  }
  async update(name: string, id: string, change: Partial<Task>) {
    const tasks = await this.list(name);
    const index = tasks.findIndex((t) => t.id === id);
    if (index < 0) return;
    tasks[index] = { ...tasks[index], ...change };
    await this.write(name, tasks);
  }
  view(task: Task, now = Date.now()) {
    const { firedFor: _firedFor, ...rest } = task;
    const next = nextRun(task, now);
    return { ...rest, nextRun: next === null ? null : new Date(next).toISOString() };
  }
  /** Compatibility fields for status: the first enabled daily restart/backup. */
  async legacyView(name: string) {
    const tasks = await this.list(name);
    const first = (kind: Task["kind"]) =>
      tasks.find((t) => t.kind === kind && t.enabled && !t.days.length)?.time ?? null;
    return { restartAt: first("restart"), backupAt: first("backup") };
  }
}
