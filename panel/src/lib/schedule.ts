import type { Task, TaskKind } from "./types";

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

const localFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

/** "04:30" UTC as the viewer's local clock time, e.g. "10:30 PM". */
export function utcToLocal(hhmm: string) {
  const match = TIME.exec(hhmm);
  if (!match) return hhmm;
  const now = new Date();
  const at = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    Number(match[1]),
    Number(match[2]),
  );
  return localFormat.format(at);
}

/** "10:30 PM (04:30 UTC)", or just the UTC time when the zone is UTC. */
export function describeUtcTime(hhmm: string) {
  const local = utcToLocal(hhmm);
  const offset = new Date().getTimezoneOffset();
  return offset === 0 ? `${hhmm} UTC` : `${local} (${hhmm} UTC)`;
}

export const isTime = (value: string) => TIME.test(value);

export const KIND_LABELS: Record<TaskKind, string> = {
  restart: "Restart",
  backup: "Backup",
  command: "Command",
  announce: "Announcement",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export { WEEKDAYS };

/** "Every day", "Weekdays", "Weekends" or "Mon, Wed, Fri" (UTC days). */
export function describeDays(days: number[]) {
  const set = [...new Set(days)].sort();
  if (set.length === 0 || set.length === 7) return "Every day";
  if (set.join() === "1,2,3,4,5") return "Weekdays";
  if (set.join() === "0,6") return "Weekends";
  return set.map((day) => WEEKDAYS[day]).join(", ");
}

/** What the task does, in a few words. */
export function describeTask(
  task: Pick<Task, "kind" | "command" | "message" | "warnMinutes">,
) {
  if (task.kind === "restart")
    return task.warnMinutes
      ? `Warns players ${task.warnMinutes} min before`
      : "No warning";
  if (task.kind === "command") return task.command ?? "";
  if (task.kind === "announce") return task.message ?? "";
  return "Snapshot to every destination";
}

/** True when the viewer's clock is UTC, so a second time adds nothing. */
export const viewerIsUtc = () => new Date().getTimezoneOffset() === 0;
