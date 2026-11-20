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

export type Server = ServerStatus & {
  dns?: ServerDns;
  effectiveSchedule?: EffectiveSchedule;
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

export type Players = {
  online: string[];
  whitelistEnabled: boolean;
  whitelist: PlayerRef[];
  ops: (PlayerRef & { level?: number })[];
  bannedPlayers: (PlayerRef & { reason?: string })[];
  bannedIps: { ip: string; reason?: string }[];
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
};

export type Directory = { path: string; entries: FileEntry[] };

export type TextFile = { path: string; text: string };

export type LogFile = { name: string; bytes: number; modifiedAt: string };
