import type { Server } from "./types";

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

/**
 * What actually runs. A per-server backup time overrides the shared nightly
 * job; a null per-server time inherits it.
 */
export function effectiveTimes(server: Server) {
  const effective = server.effectiveSchedule;
  const own = server.schedule;
  return {
    backupAt: effective?.backupAt ?? own?.backupAt ?? null,
    backupInherited: effective
      ? effective.backupSource === "global"
      : !own?.backupAt,
    restartAt: effective
      ? (effective.restartAt ?? null)
      : (own?.restartAt ?? null),
  };
}
