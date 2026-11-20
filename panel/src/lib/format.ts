const MiB = 1024 * 1024;
const units = ["B", "KiB", "MiB", "GiB", "TiB"];

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

export function formatMiB(mebibytes: number) {
  return formatBytes(mebibytes * MiB);
}

export function formatDuration(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.max(0, Math.floor(seconds))}s`;
}

const COMPACT = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/;

/** Milliseconds for ISO strings and compact snapshot ids like 20261120T163807Z-ab12. */
export function parseTime(value: string) {
  const compact = COMPACT.exec(value);
  if (compact) {
    const [, y, mo, d, h, mi, s] = compact.map(Number);
    return Date.UTC(y, mo - 1, d, h, mi, s);
  }
  return Date.parse(value);
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const steps: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

export function formatRelative(iso: string, now = Date.now()) {
  const time = parseTime(iso);
  if (Number.isNaN(time)) return "—";
  const seconds = (time - now) / 1000;
  for (const [unit, size] of steps)
    if (Math.abs(seconds) >= size)
      return relative.format(Math.round(seconds / size), unit);
  return "just now";
}

const dateTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDateTime(iso: string) {
  const time = parseTime(iso);
  return Number.isNaN(time) ? "—" : dateTime.format(time);
}

export function formatPercent(value: number) {
  return `${value.toFixed(value < 10 ? 1 : 0)}%`;
}

export type PlayerCount = { online: number; max: number; names: string[] };

const LIST_PATTERN =
  /There are (\d+) (?:of a max of|\/) ?(\d+) players online:?\s*(.*)/i;

/** Parse the RCON `list` reply. Returns null when the text is not a list. */
export function parsePlayers(text: string | null): PlayerCount | null {
  if (!text) return null;
  const match = LIST_PATTERN.exec(text.trim());
  if (!match) return null;
  const names = match[3]
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  return { online: Number(match[1]), max: Number(match[2]), names };
}

export function pluralize(count: number, singular: string, plural?: string) {
  return `${count} ${count === 1 ? singular : (plural ?? singular + "s")}`;
}
