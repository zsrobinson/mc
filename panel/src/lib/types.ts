import type {
  BackupSnapshot,
  Compatibility,
  Limits,
  ModrinthHit,
  ServerStatus,
  Service,
} from "../../../src/domain";

export type { Compatibility, Limits, ModrinthHit, Service };

/** Live measurements. Any value the server cannot measure is null. */
export type ServerMetrics = NonNullable<ServerStatus["metrics"]>;

export type Schedule = NonNullable<ServerStatus["schedule"]>;

/** The server's SRV record, as the control service sees it. */
export type ServerDns = {
  status: "ok" | "missing" | "drifted" | "unconfigured";
  recordName: string;
  /** False when the record exists but was not created by this app. */
  managed?: boolean;
};

/** The schedule that actually runs, including the shared nightly backup. */
export type EffectiveSchedule = {
  backupAt?: string | null;
  backupSource?: "global" | "server";
  restartAt?: string | null;
  timezone?: string;
};

/** How the container last ended, reported while it is not running. */
export type LastExit = {
  exitCode: number;
  /** ISO time the process ended. */
  finishedAt: string;
  oomKilled: boolean;
};

export type Server = ServerStatus & {
  dns?: ServerDns;
  effectiveSchedule?: EffectiveSchedule;
  lastExit?: LastExit;
};

export type Backup = BackupSnapshot;

/** An installed mod or datapack, resolved against Modrinth. */
export type ProjectDetail = {
  slug: string;
  title: string;
  iconUrl?: string;
  installedVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  compatible: boolean;
  downloads: number;
};

export type ProjectDetails = {
  mods: ProjectDetail[];
  datapacks: ProjectDetail[];
};

/** A Modrinth search hit with the fields the panel's search adds. */
export type SearchHit = ModrinthHit & {
  iconUrl?: string;
  downloads?: number;
  compatible?: boolean;
};

export type WorldInfo = { bytes: number; modifiedAt: string; version?: string };

export type Session = { email: string; services: Service[] };

export type PlayerRef = { name: string; uuid: string };

/** Minecraft writes these as "2026-11-20 12:00:00 +0000"; expires may be "forever". */
type BanDates = {
  reason?: string;
  created?: string;
  expires?: string;
  source?: string;
};

export type Players = {
  online: string[];
  whitelistEnabled: boolean;
  whitelist: PlayerRef[];
  ops: (PlayerRef & { level?: number })[];
  bannedPlayers: (PlayerRef & BanDates)[];
  bannedIps: ({ ip: string } & BanDates)[];
};

export type PlayerAction =
  | "kick"
  | "whitelist-add"
  | "whitelist-remove"
  | "whitelist-on"
  | "whitelist-off"
  | "op"
  | "deop"
  | "ban"
  | "pardon"
  | "ban-ip"
  | "pardon-ip";

export type Properties = { values: Record<string, string>; raw: string };

export type FileEntry = {
  name: string;
  path: string;
  type: "file" | "directory";
  bytes: number;
  modifiedAt: string;
  /** The text editor may open it. */
  editable?: boolean;
  /** A .zip the helper can extract. */
  archive?: boolean;
};

export type Directory = { path: string; entries: FileEntry[] };

export type TextFile = { path: string; text: string };

export type LogFile = { name: string; bytes: number; modifiedAt: string };

export type LogText = { file: string; text: string; truncated: boolean };

export type TaskKind = "restart" | "backup" | "command" | "announce";
export const WARN_MINUTES = [0, 1, 5, 10, 15] as const;
export type WarnMinutes = (typeof WARN_MINUTES)[number];

export type Task = {
  id: string;
  kind: TaskKind;
  /** "HH:MM" in UTC. */
  time: string;
  /** 0 = Sunday … 6 = Saturday; empty means every day. */
  days: number[];
  enabled: boolean;
  command?: string;
  message?: string;
  warnMinutes?: WarnMinutes;
  lastRun?: { at: string; ok: boolean; error?: string };
  nextRun: string | null;
};

export type TaskInput = Omit<Task, "id" | "lastRun" | "nextRun"> & {
  id?: string;
};

export type Tasks = {
  tasks: Task[];
  timezone: "UTC";
  globalBackupAt: string | null;
};

export type AuditEntry = {
  id: string;
  at: string;
  actor: string;
  verb: string;
  server?: string;
  outcome: "ok" | "error";
  durationMs: number;
  detail?: string;
  error?: string;
};

export type AuditPage = { entries: AuditEntry[]; more: boolean };

export type IntentAction =
  "delete-server" | "reset-world" | "restore-backup" | "replace-world" | "kill";
