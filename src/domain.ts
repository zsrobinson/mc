export type ServerConfig = {
  name: string;
  version: string;
  memory: number;
  port: number;
  mods: string[];
  datapacks: string[];
  javaTag: string;
  fabricLoader?: string;
};
export type ServerStatus = ServerConfig & {
  state: string;
  players: string | null;
  backup?: { at: string; targets: number };
  joinAddress?: string;
  directAddress?: string;
  metrics?: {
    uptimeSeconds: number | null;
    cpuPercent: number | null;
    memoryBytes: number | null;
    memoryLimitBytes: number | null;
    tps: number | null;
    mspt: number | null;
    cpuLimit?: number;
  };
  schedule?: { restartAt?: string | null; backupAt?: string | null };
};
export type Compatibility = {
  version: string;
  javaTag: string;
  projects: {
    project: string;
    kind: "mod" | "datapack";
    compatible: boolean;
    version: string | null;
    id: string | null;
  }[];
};
export type Limits = {
  portMin: number;
  portMax: number;
  memoryBudget: number;
  maxServers: number;
};
export type ModrinthHit = { slug: string; title: string; description: string };
export type Service = {
  name: string;
  url: string;
  icon?: string;
  colour?: string;
};

export type BackupSnapshot = {
  id: string;
  createdAt: string;
  bytes: number;
  replicated: boolean;
  locations?: string[];
  reason?: string;
  pinned?: boolean;
};
