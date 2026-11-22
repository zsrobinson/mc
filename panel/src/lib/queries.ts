import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
} from "@tanstack/react-query";

import { control, getJson } from "./api";
import type {
  Backup,
  ServerDns,
  Compatibility,
  Directory,
  Limits,
  LogFile,
  ProjectDetails,
  SearchHit,
  WorldInfo,
  Players,
  Properties,
  Server,
  Session,
  Tasks,
  TextFile,
  AuditPage,
  LogText,
} from "./types";

/** Every per-server query starts with ["server", name] so one call refreshes all. */
export const keys = {
  session: ["session"] as const,
  servers: ["servers"] as const,
  versions: ["versions"] as const,
  limits: ["limits"] as const,
  server: (name: string) => ["server", name] as const,
  status: (name: string) => ["server", name, "status"] as const,
  logs: (name: string) => ["server", name, "logs"] as const,
  logFiles: (name: string) => ["server", name, "log-files"] as const,
  players: (name: string) => ["server", name, "players"] as const,
  properties: (name: string) => ["server", name, "properties"] as const,
  backups: (name: string) => ["server", name, "backups"] as const,
  dns: (name: string) => ["server", name, "dns"] as const,
  projects: (name: string) => ["server", name, "projects"] as const,
  world: (name: string) => ["server", name, "world-info"] as const,
  loaders: (name: string) => ["server", name, "loader-versions"] as const,
  upgradeCheck: (name: string, version: string) =>
    ["server", name, "check-upgrade", version] as const,
  updates: (name: string) => ["server", name, "updates"] as const,
  files: (name: string, path: string) =>
    ["server", name, "files", path] as const,
  file: (name: string, path: string) => ["server", name, "file", path] as const,
  search: (kind: "mod" | "datapack", q: string, version: string) =>
    ["search", kind, q, version] as const,
  tasks: (name: string) => ["server", name, "tasks"] as const,
  logText: (name: string, file: string) =>
    ["server", name, "log-text", file] as const,
  /** Server activity lives under ["server", name] so mutations refresh it. */
  audit: (name: string | undefined) =>
    name
      ? (["server", name, "audit"] as const)
      : (["activity", "all"] as const),
};

export const sessionQuery = queryOptions({
  queryKey: keys.session,
  queryFn: ({ signal }) => getJson<Session>("/api/session", signal),
  staleTime: 5 * 60_000,
});

export const serversQuery = queryOptions({
  queryKey: keys.servers,
  queryFn: ({ signal }) => control<Server[]>("list", undefined, {}, signal),
  refetchInterval: 15_000,
});

export const statusQuery = (name: string) =>
  queryOptions({
    queryKey: keys.status(name),
    queryFn: ({ signal }) => control<Server>("status", name, {}, signal),
    refetchInterval: 15_000,
  });

export const versionsQuery = queryOptions({
  queryKey: keys.versions,
  queryFn: ({ signal }) => control<string[]>("versions", undefined, {}, signal),
  staleTime: 60 * 60_000,
});

/** Accepts both the normalized shape and the older MC_* environment shape. */
function normalizeLimits(raw: Record<string, unknown>): Limits {
  const pick = (key: string, legacy: string) => Number(raw[key] ?? raw[legacy]);
  return {
    portMin: pick("portMin", "MC_PORT_MIN"),
    portMax: pick("portMax", "MC_PORT_MAX"),
    memoryBudget: pick("memoryBudget", "MC_MEMORY_BUDGET_MIB"),
    maxServers: pick("maxServers", "MC_MAX_SERVERS"),
  };
}

export const limitsQuery = queryOptions({
  queryKey: keys.limits,
  queryFn: async ({ signal }) =>
    normalizeLimits(
      await control<Record<string, unknown>>("limits", undefined, {}, signal),
    ),
  staleTime: 10 * 60_000,
});

export const logsQuery = (name: string) =>
  queryOptions({
    queryKey: keys.logs(name),
    queryFn: ({ signal }) =>
      control<{ text: string }>("logs", name, {}, signal),
    refetchInterval: 2_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });

export const logFilesQuery = (name: string) =>
  queryOptions({
    queryKey: keys.logFiles(name),
    queryFn: ({ signal }) => control<LogFile[]>("logs-list", name, {}, signal),
  });

export const playersQuery = (name: string) =>
  queryOptions({
    queryKey: keys.players(name),
    queryFn: ({ signal }) => control<Players>("players", name, {}, signal),
    refetchInterval: 10_000,
  });

export const propertiesQuery = (name: string) =>
  queryOptions({
    queryKey: keys.properties(name),
    queryFn: ({ signal }) =>
      control<Properties>("properties", name, {}, signal),
    refetchOnWindowFocus: false,
  });

export const backupsQuery = (name: string) =>
  queryOptions({
    queryKey: keys.backups(name),
    queryFn: ({ signal }) => control<Backup[]>("backups", name, {}, signal),
  });

export const updatesQuery = (name: string) =>
  queryOptions({
    queryKey: keys.updates(name),
    queryFn: ({ signal }) =>
      control<Compatibility>("check-updates", name, {}, signal),
    staleTime: 5 * 60_000,
  });

export const filesQuery = (name: string, path: string) =>
  queryOptions({
    queryKey: keys.files(name, path),
    queryFn: ({ signal }) =>
      control<Directory>("files", name, { path }, signal),
    placeholderData: keepPreviousData,
  });

export const fileQuery = (name: string, path: string) =>
  queryOptions({
    queryKey: keys.file(name, path),
    queryFn: ({ signal }) =>
      control<TextFile>("read-file", name, { path }, signal),
    refetchOnWindowFocus: false,
    retry: false,
  });

export const searchQuery = (
  kind: "mod" | "datapack",
  q: string,
  version: string,
) =>
  queryOptions({
    queryKey: keys.search(kind, q, version),
    queryFn: ({ signal }) =>
      getJson<{ hits: SearchHit[] }>(
        `/api/search?${new URLSearchParams({ q, kind, version })}`,
        signal,
      ),
    enabled: q.trim().length >= 2,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

export const dnsQuery = (name: string) =>
  queryOptions({
    queryKey: keys.dns(name),
    queryFn: ({ signal }) => control<ServerDns>("dns-status", name, {}, signal),
    staleTime: 60_000,
    retry: false,
  });

export const projectsQuery = (name: string) =>
  queryOptions({
    queryKey: keys.projects(name),
    queryFn: ({ signal }) =>
      control<ProjectDetails>("mods-details", name, {}, signal),
    staleTime: 60_000,
    retry: false,
  });

export const worldInfoQuery = (name: string) =>
  queryOptions({
    queryKey: keys.world(name),
    queryFn: ({ signal }) => control<WorldInfo>("world-info", name, {}, signal),
    staleTime: 60_000,
    retry: false,
  });

export const loaderVersionsQuery = (name: string) =>
  queryOptions({
    queryKey: keys.loaders(name),
    queryFn: ({ signal }) =>
      control<string[]>("loader-versions", name, {}, signal),
    staleTime: 10 * 60_000,
    retry: false,
  });

/** check-upgrade only reads; run it as a query so results show up at once. */
export const upgradeCheckQuery = (name: string, version: string) =>
  queryOptions({
    queryKey: keys.upgradeCheck(name, version),
    queryFn: ({ signal }) =>
      control<Compatibility>("check-upgrade", name, { version }, signal),
    staleTime: 5 * 60_000,
    retry: false,
  });

export const tasksQuery = (name: string) =>
  queryOptions({
    queryKey: keys.tasks(name),
    queryFn: ({ signal }) => control<Tasks>("tasks", name, {}, signal),
  });

export const logTextQuery = (name: string, file: string) =>
  queryOptions({
    queryKey: keys.logText(name, file),
    queryFn: ({ signal }) =>
      control<LogText>("read-log", name, { file }, signal),
    refetchOnWindowFocus: false,
    retry: false,
  });

export const AUDIT_PAGE = 50;

/** Newest first; each further page asks for entries before the oldest shown. */
export const auditQuery = (name?: string) =>
  infiniteQueryOptions({
    queryKey: keys.audit(name),
    queryFn: ({ signal, pageParam }) =>
      control<AuditPage>(
        "audit",
        name,
        { limit: AUDIT_PAGE, ...(pageParam ? { before: pageParam } : {}) },
        signal,
      ),
    initialPageParam: "",
    getNextPageParam: (last) =>
      last.more && last.entries.length
        ? last.entries[last.entries.length - 1].at
        : undefined,
    refetchInterval: 30_000,
  });
