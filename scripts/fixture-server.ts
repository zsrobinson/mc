/**
 * A local stand-in for the panel server and helper, for UI work and review.
 * Every verb the panel calls answers from in-memory fixtures; mutations
 * change that state so flows can be clicked through. Nothing here touches
 * Docker, Prometheus, a helper socket or real configuration.
 *
 *   npm run build && npm run dev:fixtures        # http://127.0.0.1:8787
 *   npm run dev:fixtures & npm run dev           # Vite proxies /api here
 *
 * Modes (environment, or GET /__fixture?… at runtime, which also resets):
 *   FIXTURE_EMPTY=servers,backups,tasks,activity,files   empty states
 *   FIXTURE_CRASHED=1                                     bravo has crashed
 *   FIXTURE_HISTORY=unavailable                           no metrics source
 *   FIXTURE_SLOW=800                                      delay every API call (ms)
 *   FIXTURE_STALE_INTENT=always|once                      refuse confirmation tokens
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Hono, type Context } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { streamSSE } from "hono/streaming";
import { normalizeServerRecords } from "../src/server-state";

const EMAIL = "owner@example.com";
const DOMAIN = "example.com";
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type Mode = {
  empty: Set<string>;
  crashed: boolean;
  history: "ok" | "unavailable";
  slow: number;
  /** "once" refuses every other token (the panel retries); "always" refuses all. */
  staleIntent: "" | "once" | "always";
};

const mode: Mode = {
  empty: new Set(
    (process.env.FIXTURE_EMPTY ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .flatMap((s) =>
        s === "1" || s === "all"
          ? ["servers", "backups", "tasks", "activity", "files"]
          : [s],
      ),
  ),
  crashed: process.env.FIXTURE_CRASHED === "1",
  history: process.env.FIXTURE_HISTORY === "unavailable" ? "unavailable" : "ok",
  slow: Number(process.env.FIXTURE_SLOW ?? 0) || 0,
  staleIntent:
    process.env.FIXTURE_STALE_INTENT === "always" ||
    process.env.FIXTURE_STALE_INTENT === "once"
      ? process.env.FIXTURE_STALE_INTENT
      : "",
};
let refused = 0;

/* ------------------------------------------------------------------ data */

type Node = {
  type: "file" | "directory";
  text?: string;
  bytes: number;
  modifiedAt: string;
};
type Backup = {
  id: string;
  createdAt: string;
  bytes: number;
  replicated: boolean;
  locations: string[];
  reason?: string;
  pinned?: boolean;
};
type Task = {
  id: string;
  kind: "restart" | "backup" | "command" | "announce";
  time: string;
  days: number[];
  enabled: boolean;
  command?: string;
  message?: string;
  warnMinutes?: 0 | 1 | 5 | 10 | 15;
  lastRun?: { at: string; ok: boolean; error?: string };
};
type Ban = {
  name: string;
  uuid: string;
  created: string;
  source: string;
  expires: string;
  reason: string;
};
type IpBan = Omit<Ban, "name" | "uuid"> & { ip: string };
type Server = {
  name: string;
  version: string;
  memory: number;
  port: number;
  mods: string[];
  datapacks: string[];
  javaTag: string;
  fabricLoader: string;
  state: string;
  online: string[];
  whitelistEnabled: boolean;
  whitelist: { name: string; uuid: string }[];
  ops: { name: string; uuid: string; level: number }[];
  bans: Ban[];
  ipBans: IpBan[];
  properties: Record<string, string>;
  files: Map<string, Node>;
  backups: Backup[];
  tasks: Task[];
  startedAt: number;
  lastExit?: { exitCode: number; finishedAt: string; oomKilled: boolean };
  schedule: { restartAt: string | null; backupAt: string | null };
  log: string[];
};
type Audit = {
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

const iso = (ms: number) => new Date(Math.round(ms)).toISOString();
const pad = (n: number) => String(n).padStart(2, "0");
/** Snapshot ids look like 20261122T043201Z-ffc3be. */
function snapshotId(ms: number, seed: number) {
  const d = new Date(ms);
  const hex = ((seed * 2654435761) >>> 0).toString(16).padStart(8, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z-` +
    hex.slice(0, 6)
  );
}
const uuid = (n: number) =>
  `${String(n).repeat(8).slice(0, 8)}-0000-4000-8000-${String(n).repeat(12).slice(0, 12)}`;

const PROPERTIES: Record<string, string> = {
  motd: "§aAlpha §7— §lbuilt §r§etogether",
  difficulty: "normal",
  gamemode: "survival",
  "max-players": "20",
  "view-distance": "10",
  "simulation-distance": "10",
  "spawn-protection": "16",
  pvp: "true",
  hardcore: "false",
  "allow-flight": "false",
  "enable-command-block": "false",
  "online-mode": "true",
  "level-type": "minecraft\\:normal",
};

function rawProperties(values: Record<string, string>) {
  return (
    "#Minecraft server properties\n" +
    Object.entries(values)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") +
    "\n"
  );
}

function seedFiles(now: number, properties: Record<string, string>) {
  const files = new Map<string, Node>();
  const add = (path: string, node: Omit<Node, "modifiedAt">, age: number) =>
    files.set(path, { ...node, modifiedAt: iso(now - age) });
  const text = (path: string, body: string, age: number) =>
    add(path, { type: "file", text: body, bytes: body.length }, age);
  const dir = (path: string, age: number) =>
    add(path, { type: "directory", bytes: 0 }, age);
  dir("world", 3 * MINUTE);
  dir("world/region", 3 * MINUTE);
  add("world/level.dat", { type: "file", bytes: 4310 }, 3 * MINUTE);
  add("world/region/r.0.0.mca", { type: "file", bytes: 9_437_184 }, 3 * MINUTE);
  add(
    "world/region/r.-1.0.mca",
    { type: "file", bytes: 6_291_456 },
    9 * MINUTE,
  );
  dir("config", 2 * DAY);
  text("config/lithium.properties", "# Lithium configuration\n", 2 * DAY);
  text(
    "config/chunky.json",
    '{\n  "version": 2,\n  "language": "en_us"\n}\n',
    5 * DAY,
  );
  dir("mods", 2 * DAY);
  add(
    "mods/lithium-fabric-0.14.3.jar",
    { type: "file", bytes: 712_331 },
    2 * DAY,
  );
  add(
    "mods/chunky-fabric-1.4.16.jar",
    { type: "file", bytes: 389_021 },
    5 * DAY,
  );
  dir("logs", 10 * MINUTE);
  text(
    "logs/latest.log",
    "[12:00:01] [Server thread/INFO]: Done\n",
    10 * MINUTE,
  );
  dir("structures", 12 * DAY);
  add("structures-export.zip", { type: "file", bytes: 48_211 }, 12 * DAY);
  text("server.properties", rawProperties(properties), 1 * DAY);
  text("eula.txt", "eula=true\n", 30 * DAY);
  text(
    "whitelist.json",
    JSON.stringify([{ uuid: uuid(1), name: "Steve" }], null, 2) + "\n",
    3 * DAY,
  );
  text("ops.json", "[]\n", 3 * DAY);
  add("server-icon.png", { type: "file", bytes: 5_120 }, 8 * DAY);
  text(".rcon-cli.env", "password=fixture\n", 30 * DAY);
  return files;
}

function startupLog(name: string, version: string) {
  return [
    `[12:00:00] [main/INFO]: Loading Minecraft ${version} with Fabric Loader 0.16.9`,
    `[12:00:02] [Server thread/INFO]: Starting minecraft server version ${version}`,
    "[12:00:02] [Server thread/INFO]: Loading properties",
    "[12:00:02] [Server thread/INFO]: Default game type: SURVIVAL",
    '[12:00:03] [Server thread/INFO]: Preparing level "world"',
    "[12:00:07] [Server thread/INFO]: Preparing spawn area: 84%",
    '[12:00:08] [Server thread/INFO]: Done (5.912s)! For help, type "help"',
    `[12:00:08] [Server thread/INFO]: ${name} is ready`,
    "[12:04:31] [Server thread/INFO]: Steve joined the game",
    "[12:06:02] [Server thread/INFO]: Alex joined the game",
  ];
}

function makeServer(
  name: string,
  index: number,
  now: number,
  running: boolean,
): Server {
  const properties = {
    ...PROPERTIES,
    motd:
      index === 0 ? PROPERTIES.motd : "§bBravo §8| §7a quiet §oweekend §7world",
  };
  const backups: Backup[] = mode.empty.has("backups")
    ? []
    : Array.from({ length: index === 0 ? 9 : 4 }, (_, i) => {
        // Nightly at 04:32 UTC plus one manual snapshot.
        const day = Math.floor(now / DAY) * DAY;
        const at =
          i === 0 && index === 0
            ? now - 2 * HOUR - 13 * MINUTE
            : day -
              (i - (index === 0 ? 1 : 0)) * DAY +
              4 * HOUR +
              32 * MINUTE +
              1000;
        const when = at > now ? at - DAY : at;
        return {
          id: snapshotId(when, i + index * 31),
          createdAt: iso(when),
          bytes: (index === 0 ? 410 : 150) * 1048576 + i * 7_340_032,
          replicated: true,
          locations: ["local-disk", "offsite-copy"],
          ...(i === 0 && index === 0 ? { reason: "Manual" } : {}),
          ...(i === 3 ? { reason: "Before upgrade", pinned: true } : {}),
        };
      });
  const day = Math.floor(now / DAY) * DAY;
  const tasks: Task[] =
    mode.empty.has("tasks") || index > 0
      ? []
      : [
          {
            id: "t-restart",
            kind: "restart",
            time: "05:00",
            days: [],
            enabled: true,
            warnMinutes: 5,
            lastRun: { at: iso(day - DAY + 5 * HOUR), ok: true },
          },
          {
            id: "t-announce",
            kind: "announce",
            time: "21:30",
            days: [1, 2, 3, 4, 5],
            enabled: true,
            message: "Server restarts at 05:00 UTC. Remember to log off.",
            lastRun: { at: iso(day - DAY + 21.5 * HOUR), ok: true },
          },
          {
            id: "t-backup",
            kind: "backup",
            time: "16:00",
            days: [0, 6],
            enabled: true,
            lastRun: {
              at: iso(day - 2 * DAY + 16 * HOUR),
              ok: false,
              error: "Offsite copy did not verify; the local snapshot was kept",
            },
          },
          {
            id: "t-command",
            kind: "command",
            time: "12:00",
            days: [],
            enabled: false,
            command: "save-all flush",
          },
        ];
  return {
    name,
    version: index === 0 ? "1.21.4" : "1.21.1",
    memory: index === 0 ? 4096 : 2048,
    port: 25565 + index,
    mods: index === 0 ? ["lithium", "chunky"] : ["lithium"],
    datapacks: index === 0 ? ["terralith"] : [],
    javaTag: "java21",
    fabricLoader: "0.16.9",
    state: running
      ? "running"
      : mode.crashed && index === 1
        ? "crashed"
        : "exited",
    online: running ? ["Steve", "Alex"] : [],
    whitelistEnabled: index === 0,
    whitelist: [
      { name: "Steve", uuid: uuid(1) },
      { name: "Alex", uuid: uuid(2) },
      { name: "Notch_fan", uuid: uuid(3) },
    ],
    ops: [{ name: "Steve", uuid: uuid(1), level: 4 }],
    bans:
      index === 0
        ? [
            {
              name: "Griefer_01",
              uuid: uuid(4),
              created: "2026-11-20 12:00:00 +0000",
              source: "Server",
              expires: "forever",
              reason: "Broke the spawn build",
            },
            {
              name: "Notch_fan",
              uuid: uuid(3),
              created: "2026-11-21 18:45:10 -0500",
              source: "Steve",
              expires: "2026-12-20 12:00:00 +0000",
              reason: "Spamming chat",
            },
          ]
        : [],
    ipBans:
      index === 0
        ? [
            {
              ip: "203.0.113.7",
              created: "2026-11-19 08:30:00 +0000",
              source: "Server",
              expires: "forever",
              reason: "Banned by operator",
            },
          ]
        : [],
    properties,
    files: mode.empty.has("files") ? new Map() : seedFiles(now, properties),
    backups,
    tasks,
    startedAt: now - (3 * HOUR + 17 * MINUTE),
    ...(mode.crashed && index === 1
      ? {
          lastExit: {
            exitCode: 137,
            finishedAt: iso(now - 47 * MINUTE),
            oomKilled: true,
          },
        }
      : !running
        ? {
            lastExit: {
              exitCode: 0,
              finishedAt: iso(now - 2 * DAY),
              oomKilled: false,
            },
          }
        : {}),
    schedule: { restartAt: index === 0 ? "05:00" : null, backupAt: null },
    log: running ? startupLog(name, index === 0 ? "1.21.4" : "1.21.1") : [],
  };
}

const VERBS = [
  ["start", "ok"],
  ["restart", "ok"],
  ["backup-now", "ok"],
  ["player-action", "ok"],
  ["apply-properties", "ok"],
  ["write-file", "ok"],
  ["save-task", "ok"],
  ["upload-file", "ok"],
  ["download-world", "ok"],
  ["stop", "ok"],
  ["apply-config", "error"],
  ["delete-file", "ok"],
] as const;
const ACTORS = [EMAIL, "schedule", "timer", EMAIL, "cli", EMAIL];

function seedAudit(now: number, servers: Server[]): Audit[] {
  if (mode.empty.has("activity") || !servers.length) return [];
  const entries: Audit[] = [];
  for (let i = 0; i < 140; i++) {
    const [verb, outcome] = VERBS[(i * 7) % VERBS.length];
    const actor =
      verb === "backup-now" ? "timer" : ACTORS[(i * 5) % ACTORS.length];
    const server = servers[i % servers.length].name;
    entries.push({
      id: `a${i}`,
      at: iso(now - (i * 37 + 4) * MINUTE),
      actor,
      verb,
      server,
      outcome,
      durationMs: 120 + ((i * 97) % 4000),
      ...(verb === "player-action"
        ? { detail: ["whitelist-add", "kick", "op"][i % 3] }
        : verb === "write-file" || verb === "delete-file"
          ? { detail: "config/lithium.properties" }
          : verb === "apply-properties"
            ? { detail: "difficulty, max-players" }
            : {}),
      ...(outcome === "error"
        ? { error: "Both backup destinations must verify before changes" }
        : {}),
    });
  }
  if (mode.crashed && servers[1])
    entries.push({
      id: "crash",
      at: servers[1].lastExit!.finishedAt,
      actor: "monitor",
      verb: "crash-detected",
      server: servers[1].name,
      outcome: "error",
      durationMs: 0,
      detail: "exit code 137",
    });
  return entries.sort((a, b) => (a.at < b.at ? 1 : -1));
}

let servers: Server[] = [];
let audit: Audit[] = [];
let intents = new Map<string, { action: string; name: string; at: number }>();

function reset() {
  const now = Date.now();
  servers = mode.empty.has("servers")
    ? []
    : [makeServer("alpha", 0, now, true), makeServer("bravo", 1, now, false)];
  audit = seedAudit(now, servers);
  intents = new Map();
}
reset();

/* ------------------------------------------------------------- helpers */

class Fail extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code?: string,
  ) {
    super(message);
  }
}

const find = (name: unknown) => {
  const server = servers.find((s) => s.name === name);
  if (!server) throw new Fail("Unknown server", 404);
  return server;
};

function playersLine(s: Server) {
  return `There are ${s.online.length} of a max of ${s.properties["max-players"]} players online: ${s.online.join(", ")}`;
}

function nextRun(task: Task, now = Date.now()) {
  if (!task.enabled) return null;
  const [h, m] = task.time.split(":").map(Number);
  for (let i = 0; i < 8; i++) {
    const day = Math.floor(now / DAY) * DAY + i * DAY;
    const at = day + h * HOUR + m * MINUTE;
    const weekday = new Date(day).getUTCDay();
    if (at > now && (!task.days.length || task.days.includes(weekday)))
      return iso(at);
  }
  return null;
}

function record(s: Server) {
  const running = s.state === "running";
  const now = Date.now();
  const lastBackup = s.backups[0];
  const index = servers.indexOf(s);
  const restart = s.tasks.find((t) => t.kind === "restart" && t.enabled);
  return {
    name: s.name,
    version: s.version,
    memory: s.memory,
    port: s.port,
    mods: s.mods,
    datapacks: s.datapacks,
    javaTag: s.javaTag,
    fabricLoader: s.fabricLoader,
    state: s.state,
    health: running ? "healthy" : undefined,
    players: running ? playersLine(s) : null,
    joinAddress: `${s.name}.${DOMAIN}`,
    directAddress: `play.${DOMAIN}:${s.port}`,
    ...(lastBackup ? { backup: { at: lastBackup.createdAt, targets: 2 } } : {}),
    metrics: running
      ? {
          uptimeSeconds: Math.round((now - s.startedAt) / 1000),
          cpuPercent: 18.4 + index * 3,
          memoryBytes: 2.6 * 1073741824,
          memoryLimitBytes: (s.memory + 512) * 1048576,
          tps: 20,
          mspt: 11.8,
          cpuLimit: 2,
        }
      : {
          uptimeSeconds: null,
          cpuPercent: null,
          memoryBytes: null,
          memoryLimitBytes: null,
          tps: null,
          mspt: null,
        },
    schedule: { restartAt: restart?.time ?? null, backupAt: null },
    effectiveSchedule: {
      backupAt: "04:30",
      backupSource: "global",
      restartAt: restart?.time ?? null,
      timezone: "UTC",
    },
    dns: {
      status: "ok",
      recordName: `_minecraft._tcp.${s.name}.${DOMAIN}`,
      managed: true,
    },
    ...(running ? {} : s.lastExit ? { lastExit: s.lastExit } : {}),
    ...(index === 0
      ? {
          restoreTest: {
            at: now - 26 * HOUR,
            ok: true,
            snapshot: s.backups[1]?.id ?? "",
            regionFiles: 42,
            version: s.version,
          },
        }
      : {}),
  };
}

function log(
  actor: string,
  verb: string,
  server: string | undefined,
  outcome: "ok" | "error",
  extra: Partial<Audit> = {},
) {
  audit.unshift({
    id: `a${Date.now()}${Math.random().toString(16).slice(2, 6)}`,
    at: iso(Date.now()),
    actor,
    verb,
    ...(server ? { server } : {}),
    outcome,
    durationMs: 80 + Math.round(Math.random() * 900),
    ...extra,
  });
}

function requireIntent(
  name: string,
  action: string,
  payload: Record<string, unknown>,
) {
  if (payload.confirm !== true && payload.confirm !== "true")
    throw new Fail("Confirmation required");
  if (payload.confirmName !== name)
    throw new Fail("The typed name does not match the server");
  const token = String(payload.intent ?? "");
  const intent = intents.get(token);
  intents.delete(token);
  const stale =
    mode.staleIntent === "always" ||
    (mode.staleIntent === "once" && refused++ % 2 === 0);
  if (
    stale ||
    !intent ||
    intent.action !== action ||
    intent.name !== name ||
    Date.now() - intent.at > 5 * MINUTE
  )
    throw new Fail(
      "This action needs a fresh confirmation",
      409,
      "intent-required",
    );
}

const PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\0]*$/;
function cleanPath(value: unknown) {
  const path = String(value ?? "").replace(/^\/+|\/+$/g, "");
  if (!PATH.test(path)) throw new Fail("Invalid path");
  return path;
}
const parent = (path: string) => path.split("/").slice(0, -1).join("/");
const base = (path: string) => path.split("/").at(-1) ?? path;
const isSecret = (path: string) =>
  path.split("/").some((p) => /^\.rcon-cli\.|^\.env|\.secret$/i.test(p));
const TEXT = /\.(txt|json|properties|yml|yaml|toml|cfg|conf|log|mcmeta|md)$/i;

function listing(s: Server, path: string) {
  if (path && s.files.get(path)?.type !== "directory")
    throw new Fail("Folder not found", 404);
  const entries = [...s.files.entries()]
    .filter(([p]) => parent(p) === path && p !== "")
    .map(([p, node]) => ({
      name: base(p),
      path: p,
      type: node.type,
      bytes: node.bytes,
      modifiedAt: node.modifiedAt,
      editable: node.type === "file" && TEXT.test(p) && node.bytes < 1048576,
      archive: node.type === "file" && /\.zip$/i.test(p),
    }));
  return { path, entries };
}

const DAYS = [0, 1, 2, 3, 4, 5, 6];
function validateTask(input: Record<string, unknown>): Omit<Task, "id"> {
  const kind = input.kind;
  if (!["restart", "backup", "command", "announce"].includes(String(kind)))
    throw new Fail("Unknown task kind");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(input.time)))
    throw new Fail("Time must be HH:MM in UTC");
  const days = Array.isArray(input.days) ? input.days.map(Number) : [];
  if (days.some((d) => !DAYS.includes(d))) throw new Fail("Invalid day");
  const task: Omit<Task, "id"> = {
    kind: kind as Task["kind"],
    time: String(input.time),
    days: [...new Set(days)].sort(),
    enabled: input.enabled !== false,
  };
  if (kind === "command") {
    const command = String(input.command ?? "").trim();
    if (!command || command.length > 200 || command.startsWith("/"))
      throw new Fail("Enter one command without a leading slash");
    task.command = command;
  }
  if (kind === "announce") {
    const message = String(input.message ?? "").trim();
    if (!message || message.length > 200)
      throw new Fail("Enter a message of up to 200 characters");
    task.message = message;
  }
  if (kind === "restart") {
    const warn = Number(input.warnMinutes ?? 0);
    if (![0, 1, 5, 10, 15].includes(warn)) throw new Fail("Invalid warning");
    task.warnMinutes = warn as Task["warnMinutes"];
  }
  return task;
}

/* ---------------------------------------------------------------- verbs */

type Payload = Record<string, unknown>;

async function run(
  verb: string,
  name: string | undefined,
  payload: Payload,
  actor: string,
): Promise<unknown> {
  const now = Date.now();
  switch (verb) {
    case "list":
      return servers.map(record);
    case "status":
      return record(find(name));
    case "versions":
      return ["1.21.4", "1.21.3", "1.21.1", "1.20.6", "1.20.4"];
    case "limits":
      return {
        portMin: 25565,
        portMax: 25600,
        memoryBudget: 12288,
        maxServers: 4,
      };
    case "create-progress":
      return { phase: "Downloading Fabric server", detail: "1.21.4" };
    case "create-server": {
      const n = String(payload.name ?? "");
      if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(n)) throw new Fail("Invalid name");
      if (servers.some((s) => s.name === n))
        throw new Fail("A server with this name exists");
      await new Promise((r) => setTimeout(r, 1200));
      const s = makeServer(n, servers.length, now, true);
      s.backups = [];
      s.tasks = [];
      s.online = [];
      s.version = String(payload.version || "1.21.4");
      if (payload.gamemode) s.properties.gamemode = String(payload.gamemode);
      if (payload.difficulty)
        s.properties.difficulty = String(payload.difficulty);
      if (payload.hardcore) s.properties.hardcore = "true";
      if (payload.levelType)
        s.properties["level-type"] = `minecraft\\:${payload.levelType}`;
      s.properties.motd = `A Minecraft server`;
      servers.push(s);
      return record(s);
    }
    case "confirm-intent": {
      const s = find(name);
      const action = String(payload.action);
      if (
        ![
          "delete-server",
          "reset-world",
          "restore-backup",
          "replace-world",
          "kill",
        ].includes(action)
      )
        throw new Fail("Unknown action");
      const token = `i-${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      intents.set(token, { action, name: s.name, at: now });
      return { token, action, expiresAt: iso(now + 5 * MINUTE) };
    }
  }

  if (verb === "audit") {
    const limit = Math.min(500, Math.max(1, Number(payload.limit ?? 100)));
    const before = typeof payload.before === "string" ? payload.before : "";
    const matching = audit.filter(
      (e) => (!name || e.server === name) && (!before || e.at < before),
    );
    return {
      entries: matching.slice(0, limit),
      more: matching.length > limit,
    };
  }

  const s = find(name);
  switch (verb) {
    case "start":
    case "restart":
      s.state = "running";
      s.startedAt = now;
      s.online = verb === "restart" ? [] : s.online;
      s.log = startupLog(s.name, s.version).slice(0, 8);
      delete s.lastExit;
      return record(s);
    case "stop":
      s.state = "exited";
      s.online = [];
      s.lastExit = { exitCode: 0, finishedAt: iso(now), oomKilled: false };
      return record(s);
    case "kill":
      requireIntent(s.name, "kill", payload);
      s.state = "exited";
      s.online = [];
      s.lastExit = { exitCode: 137, finishedAt: iso(now), oomKilled: false };
      return record(s);
    case "logs":
      return {
        text:
          s.state === "running"
            ? s.log.join("\n") + "\n"
            : s.lastExit && s.lastExit.exitCode !== 0
              ? s.log.join("\n") +
                `\n[12:41:09] [Server thread/ERROR]: Encountered an unexpected exception\njava.lang.OutOfMemoryError: Java heap space\n`
              : "",
      };
    case "logs-list":
      return [
        {
          name: "latest.log",
          bytes: 18_204,
          modifiedAt: iso(now - 2 * MINUTE),
        },
        {
          name: "2026-11-21-1.log.gz",
          bytes: 412_877,
          modifiedAt: iso(now - DAY),
        },
        {
          name: "2026-11-20-2.log.gz",
          bytes: 9_337,
          modifiedAt: iso(now - 2 * DAY),
        },
        { name: "debug.log", bytes: 1_902_311, modifiedAt: iso(now - HOUR) },
      ];
    case "read-log": {
      const file = String(payload.file ?? "");
      if (!/^[\w.-]+\.log(\.gz)?$/.test(file)) throw new Fail("Unknown log");
      const lines = [...startupLog(s.name, s.version)];
      for (let i = 0; i < 60; i++)
        lines.push(
          `[13:${pad(i % 60)}:${pad((i * 7) % 60)}] [Server thread/INFO]: Saved the game (autosave ${i + 1})`,
        );
      return {
        file,
        text: lines.join("\n") + "\n",
        truncated: file !== "latest.log",
      };
    }
    case "rcon": {
      const command = String(payload.command ?? "");
      s.log.push(`[12:10:00] [RCON Client/INFO]: ${command}`);
      return {
        text:
          command === "list"
            ? playersLine(s)
            : command.startsWith("say ")
              ? ""
              : `Ran ${command}`,
      };
    }
    case "players":
      return {
        online: s.online,
        whitelistEnabled: s.whitelistEnabled,
        whitelist: s.whitelist,
        ops: s.ops,
        bannedPlayers: s.bans,
        bannedIps: s.ipBans,
      };
    case "player-action": {
      const action = String(payload.action);
      const player = String(payload.player ?? "");
      const ref = { name: player, uuid: uuid(player.length % 9) };
      const created = "2026-11-22 09:15:00 +0000";
      if (action === "whitelist-add") s.whitelist.push(ref);
      if (action === "whitelist-remove")
        s.whitelist = s.whitelist.filter((p) => p.name !== player);
      if (action === "whitelist-on") s.whitelistEnabled = true;
      if (action === "whitelist-off") s.whitelistEnabled = false;
      if (action === "op") s.ops.push({ ...ref, level: 4 });
      if (action === "deop") s.ops = s.ops.filter((p) => p.name !== player);
      if (action === "kick" || action === "ban")
        s.online = s.online.filter((p) => p !== player);
      if (action === "ban")
        s.bans.push({
          ...ref,
          created,
          source: "Server",
          expires: "forever",
          reason: String(payload.reason ?? "Banned by operator"),
        });
      if (action === "pardon") s.bans = s.bans.filter((b) => b.name !== player);
      if (action === "ban-ip")
        s.ipBans.push({
          ip: player,
          created,
          source: "Server",
          expires: "forever",
          reason: String(payload.reason ?? "Banned by operator"),
        });
      if (action === "pardon-ip")
        s.ipBans = s.ipBans.filter((b) => b.ip !== player);
      return { ok: true };
    }
    case "properties":
      return { values: s.properties, raw: rawProperties(s.properties) };
    case "apply-properties": {
      if (typeof payload.raw === "string") {
        for (const line of payload.raw.split("\n")) {
          const match = /^([\w.-]+)=(.*)$/.exec(line.trim());
          if (match) s.properties[match[1]] = match[2];
        }
      } else
        for (const [k, v] of Object.entries((payload.values ?? {}) as Payload))
          s.properties[k] = String(v);
      return { ok: true };
    }
    case "apply-config":
    case "set-loader": {
      if (typeof payload.memory === "number") s.memory = payload.memory;
      if (typeof payload.port === "number") s.port = payload.port;
      if (typeof payload.version === "string") s.version = payload.version;
      if (Array.isArray(payload.mods)) s.mods = payload.mods.map(String);
      if (Array.isArray(payload.datapacks))
        s.datapacks = payload.datapacks.map(String);
      if (typeof payload.loader === "string") s.fabricLoader = payload.loader;
      return record(s);
    }
    case "schedule":
      return { ok: true };
    case "backups":
      return s.backups;
    case "backup-now": {
      await new Promise((r) => setTimeout(r, 900));
      const backup: Backup = {
        id: snapshotId(now, now % 9973),
        createdAt: iso(now),
        bytes: 420 * 1048576,
        replicated: true,
        locations: ["local-disk", "offsite-copy"],
        reason: "Manual",
      };
      s.backups.unshift(backup);
      return { snapshot: backup.id };
    }
    case "pin-backup": {
      const b = s.backups.find((x) => x.id === payload.snapshot);
      if (!b) throw new Fail("Unknown snapshot", 404);
      b.pinned = Boolean(payload.pinned);
      return { ok: true };
    }
    case "restore-test":
      await new Promise((r) => setTimeout(r, 700));
      return { ok: true, snapshot: s.backups[0]?.id };
    case "restore-backup": {
      requireIntent(s.name, "restore-backup", payload);
      const b = s.backups.find((x) => x.id === payload.snapshot);
      if (!b) throw new Fail("Unknown snapshot", 404);
      await new Promise((r) => setTimeout(r, 900));
      s.backups.unshift({
        id: snapshotId(now, 77),
        createdAt: iso(now),
        bytes: b.bytes,
        replicated: true,
        locations: ["local-disk", "offsite-copy"],
        reason: "Before restore",
        pinned: true,
      });
      return { restored: b.id };
    }
    case "reset-world": {
      requireIntent(s.name, "reset-world", payload);
      await new Promise((r) => setTimeout(r, 900));
      s.backups.unshift({
        id: snapshotId(now, 78),
        createdAt: iso(now),
        bytes: 400 * 1048576,
        replicated: true,
        locations: ["local-disk", "offsite-copy"],
        reason: "Before world reset",
        pinned: true,
      });
      return { ok: true };
    }
    case "delete-server": {
      requireIntent(s.name, "delete-server", payload);
      servers = servers.filter((x) => x !== s);
      return { deleted: true, backup: snapshotId(now, 79) };
    }
    case "rename-server": {
      const next = String(payload.newName ?? "");
      if (payload.confirmName !== s.name) throw new Fail("Name mismatch");
      s.name = next;
      return record(s);
    }
    case "world-info":
      return {
        bytes: 15_734_000 + s.backups.length,
        modifiedAt: iso(now - 3 * MINUTE),
        version: s.version,
      };
    case "dns-status":
      return {
        status: "ok",
        recordName: `_minecraft._tcp.${s.name}.${DOMAIN}`,
        managed: true,
      };
    case "fix-dns":
      return {
        status: "ok",
        recordName: `_minecraft._tcp.${s.name}.${DOMAIN}`,
      };
    case "mods-details":
      return {
        mods: s.mods.map((slug, i) => ({
          slug,
          title: slug.charAt(0).toUpperCase() + slug.slice(1),
          installedVersion: i ? "1.4.16" : "0.14.3",
          latestVersion: i ? "1.4.16" : "0.14.4",
          updateAvailable: i === 0,
          compatible: true,
          downloads: 1_200_000 - i * 400_000,
        })),
        datapacks: s.datapacks.map((slug) => ({
          slug,
          title: "Terralith",
          installedVersion: "2.5.5",
          latestVersion: "2.5.5",
          updateAvailable: false,
          compatible: true,
          downloads: 3_400_000,
        })),
      };
    case "check-updates":
    case "check-upgrade":
      return {
        version: String(payload.version ?? s.version),
        javaTag: "java21",
        projects: [
          ...s.mods.map((p, i) => ({
            project: p,
            kind: "mod",
            compatible: true,
            version: i ? "1.4.16" : "0.14.4",
            id: `v${i}`,
          })),
          ...s.datapacks.map((p) => ({
            project: p,
            kind: "datapack",
            compatible: true,
            version: "2.5.5",
            id: "d0",
          })),
        ],
      };
    case "loader-versions":
      return ["0.16.9", "0.16.8", "0.16.7"];
    case "upload-datapack":
      return { uploaded: String(payload.filename), note: "" };
    case "files":
      return listing(s, cleanPath(payload.path));
    case "read-file": {
      const path = cleanPath(payload.path);
      const node = s.files.get(path);
      if (!node || node.type !== "file") throw new Fail("File not found", 404);
      if (isSecret(path)) throw new Fail("Secret files are not available");
      if (node.text === undefined)
        throw new Fail("This is not a text file. Download it instead.");
      return { path, text: node.text };
    }
    case "write-file": {
      const path = cleanPath(payload.path);
      const text = String(payload.text ?? "");
      s.files.set(path, {
        type: "file",
        text,
        bytes: text.length,
        modifiedAt: iso(now),
      });
      return { path };
    }
    case "delete-file": {
      const path = cleanPath(payload.path);
      if (!s.files.has(path)) throw new Fail("Not found", 404);
      for (const key of [...s.files.keys()])
        if (key === path || key.startsWith(path + "/")) s.files.delete(key);
      return { deleted: path };
    }
    case "make-directory": {
      const path = cleanPath(payload.path);
      if (!path) throw new Fail("Enter a folder name");
      if (s.files.has(path)) throw new Fail("Something with that name exists");
      if (parent(path) && s.files.get(parent(path))?.type !== "directory")
        throw new Fail("The parent folder does not exist");
      s.files.set(path, { type: "directory", bytes: 0, modifiedAt: iso(now) });
      return { path };
    }
    case "rename-file": {
      const from = cleanPath(payload.from);
      const to = cleanPath(payload.to);
      if (!s.files.has(from)) throw new Fail("Not found", 404);
      if (s.files.has(to)) throw new Fail("Something with that name exists");
      if (["world", "server.properties", "server-icon.png"].includes(from))
        throw new Fail(`${from} cannot be renamed`);
      if (isSecret(to) || isSecret(from))
        throw new Fail("Secret files cannot be renamed");
      if (parent(to) && s.files.get(parent(to))?.type !== "directory")
        throw new Fail("The destination folder does not exist");
      for (const [key, node] of [...s.files.entries()])
        if (key === from || key.startsWith(from + "/")) {
          s.files.delete(key);
          s.files.set(to + key.slice(from.length), node);
        }
      return { path: to };
    }
    case "archive-files": {
      const paths = Array.isArray(payload.paths)
        ? payload.paths.map(cleanPath)
        : [];
      const destination = cleanPath(payload.destination);
      if (!paths.length || paths.length > 200)
        throw new Fail("Choose between 1 and 200 items");
      if (!/\.zip$/i.test(destination))
        throw new Fail("The archive name must end in .zip");
      if (s.files.has(destination))
        throw new Fail("An archive with that name exists");
      let bytes = 0;
      let entries = 0;
      for (const [key, node] of s.files)
        if (paths.some((p) => key === p || key.startsWith(p + "/"))) {
          if (isSecret(key)) continue;
          entries++;
          bytes += node.bytes;
        }
      await new Promise((r) => setTimeout(r, 600));
      s.files.set(destination, {
        type: "file",
        bytes: Math.round(bytes * 0.6) + 22,
        modifiedAt: iso(now),
      });
      return { path: destination, entries, bytes };
    }
    case "extract-archive": {
      const path = cleanPath(payload.path);
      const destination = cleanPath(payload.destination);
      if (!/\.zip$/i.test(path) || !s.files.has(path))
        throw new Fail("Archive not found", 404);
      if (destination === "world" || destination.startsWith("world/"))
        throw new Fail("Archives cannot be extracted into world/");
      const files = ["readme.txt", "data/pack.mcmeta", "data/info.json"];
      if (files.some((f) => s.files.has(join(destination, f))))
        throw new Fail(
          "Extracting would overwrite existing files; choose an empty folder",
        );
      await new Promise((r) => setTimeout(r, 600));
      const dirs = [destination, `${destination}/data`].filter(Boolean);
      for (const d of dirs)
        if (!s.files.has(d))
          s.files.set(d, { type: "directory", bytes: 0, modifiedAt: iso(now) });
      for (const f of files) {
        const text = `Extracted from ${base(path)}\n`;
        s.files.set(destination ? `${destination}/${f}` : f, {
          type: "file",
          text,
          bytes: text.length,
          modifiedAt: iso(now),
        });
      }
      return { destination, entries: files.length };
    }
    case "tasks":
      return {
        tasks: s.tasks.map((t) => ({ ...t, nextRun: nextRun(t, now) })),
        timezone: "UTC",
        globalBackupAt: "04:30",
      };
    case "save-task": {
      const input = (payload.task ?? {}) as Payload;
      const task = validateTask(input);
      if (input.id) {
        const existing = s.tasks.find((t) => t.id === input.id);
        if (!existing) throw new Fail("Task not found", 404);
        Object.assign(existing, task);
        for (const key of ["command", "message", "warnMinutes"] as const)
          if (!(key in task)) delete existing[key];
        return { ...existing, nextRun: nextRun(existing, now) };
      }
      const created: Task = { id: `t-${now.toString(36)}`, ...task };
      s.tasks.push(created);
      return { ...created, nextRun: nextRun(created, now) };
    }
    case "delete-task": {
      if (payload.confirm !== true) throw new Fail("Confirmation required");
      const before = s.tasks.length;
      s.tasks = s.tasks.filter((t) => t.id !== payload.id);
      if (s.tasks.length === before) throw new Fail("Task not found", 404);
      return { deleted: true };
    }
    case "run-task": {
      const task = s.tasks.find((t) => t.id === payload.id);
      if (!task) throw new Fail("Task not found", 404);
      await new Promise((r) => setTimeout(r, 500));
      task.lastRun = { at: iso(Date.now()), ok: true };
      log("schedule", "run-task", s.name, "ok", { detail: task.kind });
      return { ok: true };
    }
  }
  void actor;
  throw new Fail(`Unknown verb ${verb}`);
}

const READS = new Set([
  "list",
  "status",
  "versions",
  "limits",
  "create-progress",
  "audit",
  "logs",
  "logs-list",
  "read-log",
  "players",
  "properties",
  "backups",
  "world-info",
  "dns-status",
  "mods-details",
  "check-updates",
  "check-upgrade",
  "loader-versions",
  "files",
  "read-file",
  "tasks",
  "confirm-intent",
]);

/* --------------------------------------------------------------- history */

const RANGES = {
  "1h": [3600, 30],
  "24h": [86400, 300],
  "7d": [604800, 1800],
  "30d": [2592000, 7200],
} as const;

function history(range: keyof typeof RANGES, only?: string) {
  const [seconds, step] = RANGES[range];
  const end = Math.floor(Date.now() / 1000 / step) * step;
  const start = end - seconds;
  const base = {
    range,
    start: start * 1000,
    end: end * 1000,
    step: step * 1000,
    timeUnit: "milliseconds",
  };
  if (mode.history === "unavailable")
    return { ...base, series: {}, unavailable: true };
  const names = servers.map((s) => s.name).filter((n) => !only || n === only);
  const times: number[] = [];
  for (let t = start; t <= end; t += step) times.push(t);
  const wave = (t: number, period: number, phase = 0) =>
    Math.sin((t / period) * 2 * Math.PI + phase);
  const series = (
    fn: (t: number, i: number, server: Server) => number | null,
  ) =>
    names.map((name, i) => {
      const server = servers.find((s) => s.name === name)!;
      // A server that is not running has no samples for the last few hours.
      const cutoff = server.state === "running" ? Infinity : end - 6 * 3600;
      return {
        metric: { server: name },
        values: times
          .filter((t) => t <= cutoff)
          .map((t) => [t * 1000, fn(t, i, server)] as const)
          .filter(([, v]) => v !== null)
          .map(([t, v]) => [t, String(v)]),
      };
    });
  const global = (fn: (t: number) => number) => [
    {
      metric: {},
      values: times.map((t) => [t * 1000, String(fn(t))]),
    },
  ];
  return {
    ...base,
    series: {
      up: series(() => 1),
      players: series((t, i, s) =>
        // The newest sample agrees with who is online right now.
        t === end && s.state === "running"
          ? s.online.length
          : Math.max(
              0,
              Math.round(
                1.6 + 1.6 * wave(t, 86400, i * 2) + 0.6 * wave(t, 5400),
              ),
            ),
      ),
      mspt: series((t, i) =>
        Number((10 + 3 * wave(t, 3 * 3600, i) + 1.5 * wave(t, 600)).toFixed(2)),
      ),
      cpu: series((t, i) =>
        Number((16 + 8 * wave(t, 86400, i) + 4 * wave(t, 900)).toFixed(1)),
      ),
      memory: series((t, i) =>
        Math.round((2.4 + i * 0.6 + 0.3 * wave(t, 7200, i)) * 1073741824),
      ),
      memoryLimit: series((_t, _i, s) => (s.memory + 512) * 1048576),
      backup: series((t) => Math.floor(t / 86400) * 86400 + 16320),
      requests: only
        ? []
        : global((t) => Number((0.4 + 0.3 * wave(t, 3600)).toFixed(3))),
      errors: only ? [] : global(() => 0),
    },
  };
}

/* ------------------------------------------------------------------ app */

const app = new Hono();

app.use("/api/*", async (_c, next) => {
  if (mode.slow) await new Promise((r) => setTimeout(r, mode.slow));
  await next();
});

app.get("/__fixture", (c) => {
  const q = c.req.query();
  if ("empty" in q)
    mode.empty = new Set(
      q.empty
        .split(",")
        .filter(Boolean)
        .flatMap((s) =>
          s === "all"
            ? ["servers", "backups", "tasks", "activity", "files"]
            : [s],
        ),
    );
  if ("crashed" in q) mode.crashed = q.crashed === "1";
  if ("history" in q)
    mode.history = q.history === "unavailable" ? "unavailable" : "ok";
  if ("slow" in q) mode.slow = Number(q.slow) || 0;
  if ("stale" in q)
    mode.staleIntent =
      q.stale === "always" || q.stale === "once" ? q.stale : "";
  reset();
  return c.json({
    empty: [...mode.empty],
    crashed: mode.crashed,
    history: mode.history,
    slow: mode.slow,
    staleIntent: mode.staleIntent,
  });
});

app.get("/api/session", (c) =>
  c.json({
    email: EMAIL,
    services: [
      { name: "Minecraft", url: "/", colour: "gr" },
      { name: "Example", url: "https://app.example.com/", icon: "globe" },
    ],
  }),
);

app.post("/api/control", async (c) => {
  let input: {
    verb?: string;
    name?: string;
    payload?: Payload;
    actor?: string;
  };
  try {
    input = await c.req.json();
  } catch {
    return c.json({ error: "Invalid request" }, 400);
  }
  const verb = String(input.verb ?? "");
  const actor = input.actor ?? EMAIL;
  const started = Date.now();
  try {
    const result = await run(verb, input.name, input.payload ?? {}, actor);
    if (!READS.has(verb))
      log(actor, verb, input.name, "ok", {
        durationMs: Date.now() - started,
        ...(verb === "save-task"
          ? { detail: String((input.payload?.task as Payload)?.kind ?? "") }
          : verb === "player-action"
            ? { detail: String(input.payload?.action ?? "") }
            : typeof input.payload?.path === "string"
              ? { detail: input.payload.path }
              : {}),
      });
    return c.json(normalizeServerRecords(result) as object);
  } catch (error) {
    const fail =
      error instanceof Fail ? error : new Fail("Unexpected fixture error", 500);
    if (!READS.has(verb) && fail.status !== 409)
      log(actor, verb, input.name, "error", { error: fail.message });
    return c.json(
      { error: fail.message, ...(fail.code ? { code: fail.code } : {}) },
      fail.status as 400,
    );
  }
});

app.get("/api/history", (c) => {
  const range = c.req.query("range") ?? "24h";
  const server = c.req.query("server");
  if (!Object.hasOwn(RANGES, range))
    return c.json({ error: "Invalid history request" }, 400);
  if (server && !servers.some((s) => s.name === server))
    return c.json({ error: "Unknown server" }, 404);
  return c.json(history(range as keyof typeof RANGES, server));
});

app.get("/api/console", (c) => {
  const name = c.req.query("name");
  const server = servers.find((s) => s.name === name);
  if (!server) return c.json({ error: "Unknown server" }, 404);
  return streamSSE(c, async (stream) => {
    let sent = -1;
    while (!stream.aborted) {
      if (server.log.length !== sent) {
        sent = server.log.length;
        await stream.writeSSE({
          event: "logs",
          data: JSON.stringify({
            text: server.log.length ? server.log.join("\n") + "\n" : "",
          }),
        });
      }
      await stream.sleep(1000);
    }
  });
});

// 1×1 green PNG for the server icon.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

app.get("/api/download", (c) => {
  const verb = c.req.query("verb");
  const path = c.req.query("path") ?? c.req.query("snapshot") ?? "world";
  if (verb === "download-file" && path === "server-icon.png")
    return c.body(PNG, 200, { "Content-Type": "image/png" });
  const name = base(path) + (verb === "download-world" ? ".zip" : "");
  log(EMAIL, verb ?? "download", c.req.query("name"), "ok", { detail: path });
  return c.body(`Fixture download of ${path}\n`, 200, {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
  });
});

app.post("/api/upload", async (c) => {
  const q = c.req.query();
  const bytes = (await c.req.arrayBuffer()).byteLength;
  try {
    const s = find(q.name);
    if (q.verb === "upload-world") {
      requireIntent(s.name, "replace-world", {
        confirm: q.confirm,
        confirmName: q.confirmName,
        intent: q.intent,
      });
      log(EMAIL, "upload-world", s.name, "ok");
      return c.json({ ok: true });
    }
    if (q.verb === "upload-file") {
      const path = cleanPath(q.path);
      if (s.files.has(path) && q.confirm !== "true")
        throw new Fail("A file with this name exists");
      s.files.set(path, { type: "file", bytes, modifiedAt: iso(Date.now()) });
      log(EMAIL, "upload-file", s.name, "ok", { detail: path });
      return c.json({ path });
    }
    log(EMAIL, q.verb ?? "upload", s.name, "ok");
    return c.json({ ok: true });
  } catch (error) {
    const fail = error instanceof Fail ? error : new Fail("Upload failed", 500);
    return c.json(
      { error: fail.message, ...(fail.code ? { code: fail.code } : {}) },
      fail.status as 400,
    );
  }
});

app.get("/api/search", (c) => {
  const kind = c.req.query("kind") === "datapack" ? "datapack" : "mod";
  const q = (c.req.query("q") ?? "").toLowerCase();
  const hits = (
    kind === "mod"
      ? [
          ["lithium", "Lithium", "General-purpose server optimisation"],
          ["chunky", "Chunky", "Pre-generates chunks quickly"],
          ["spark", "spark", "Performance profiler"],
          ["ferrite-core", "FerriteCore", "Reduces memory usage"],
        ]
      : [
          ["terralith", "Terralith", "Explore almost 100 new biomes"],
          ["incendium", "Incendium", "Nether overhaul"],
        ]
  )
    .filter(
      ([slug, title]) =>
        !q || slug.includes(q) || title.toLowerCase().includes(q),
    )
    .map(([slug, title, description], i) => ({
      slug,
      title,
      description,
      downloads: 4_000_000 - i * 900_000,
      iconUrl: "/api/modrinth-icon/" + slug,
      compatible: true,
    }));
  return c.json({ hits });
});

// A flat square per player stands in for the skin avatar.
app.get("/api/player-head/:name", (c) => {
  const name = c.req.param("name");
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  return c.body(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="hsl(${hue} 45% 45%)"/><rect x="8" y="12" width="5" height="5" fill="#fff"/><rect x="19" y="12" width="5" height="5" fill="#fff"/></svg>`,
    200,
    { "Content-Type": "image/svg+xml" },
  );
});
app.get("/api/modrinth-icon/:project", (c) => c.body(null, 204));
app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

const root = process.env.FIXTURE_DIST ?? "./dist";
app.use("/*", serveStatic({ root }));
app.get("*", async (c: Context) => {
  try {
    return c.html(await readFile(join(root, "index.html"), "utf8"));
  } catch {
    return c.text(
      "Build the panel first (npm run build), or use npm run dev with API_PORT.",
      404,
    );
  }
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, hostname: "127.0.0.1", port }, () =>
  console.log(`Fixture panel on http://127.0.0.1:${port}`),
);
