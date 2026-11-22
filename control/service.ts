import { projectDetails } from "./projects";
import { serializeProperties } from "./properties";
import { mkdir, writeFile, rename, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { ConfigStore, patchSchema, nameSchema, exists, atomic } from "./config";
import { Docker, reportedContainerState } from "./docker";
import { Upstream } from "./upstream";
import { Backups } from "./backups";
import type { ServerConfig, ServerStatus } from "../src/domain";
// zip.js reads metadata without extracting paths or executing archive content.
import { Management, managementVerbs } from "./management";
import { Dns } from "./dns";
import {
  Audit,
  Intents,
  actorSchema,
  auditDetail,
  auditFile,
  destructiveActions,
  readVerbs,
  type DestructiveAction,
} from "./audit";
import { Tasks } from "./tasks";
import { runTask } from "./scheduler";
import { pathSchema } from "./files";
import { BlobReader, ZipReader } from "@zip.js/zip.js";
export const requestSchema = z
  .object({
    verb: z.enum([
      ...managementVerbs,
      "list",
      "status",
      "versions",
      "limits",
      "start",
      "stop",
      "restart",
      "logs",
      "rcon",
      "apply-config",
      "backup-now",
      "pin-backup",
      "backups",
      "create-server",
      "create-progress",
      "mods-details",
      "loader-versions",
      "dns-status",
      "fix-dns",
      "rename-server",
      "check-upgrade",
      "check-updates",
      "upload-datapack",
      "confirm-intent",
      "make-directory",
      "rename-file",
      "archive-files",
      "extract-archive",
      "read-log",
      "tasks",
      "save-task",
      "delete-task",
      "run-task",
      "audit",
    ]),
    name: nameSchema.optional(),
    payload: z.unknown().optional(),
    actor: actorSchema.optional(),
  })
  .strict();
export type ControlRequest = z.infer<typeof requestSchema>;
export class Control {
  readonly management: Management;
  readonly tasks: Tasks;
  readonly audit: Audit;
  readonly intents = new Intents();
  readonly creation = new Map<string, { phase: string; error?: string }>();
  progress(name: string) {
    return this.creation.get(name) ?? { phase: "unknown" };
  }
  async activeNames() {
    const active = new Set<string>();
    for (const c of await this.store.list())
      if ((await this.docker.container(c.name, true))?.State.Running)
        active.add(c.name);
    return active;
  }
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    readonly store: ConfigStore,
    readonly docker: Docker,
    readonly upstream: Upstream,
    readonly backups: Backups,
    readonly addresses: { joinDomain?: string; directHost?: string } = {},
    readonly dns = new Dns(),
  ) {
    this.management = new Management(docker, backups);
    this.tasks = new Tasks(store);
    this.audit = new Audit(auditFile(store.root));
  }
  /** Dispatches a request and records mutations in the activity log. */
  async run(input: unknown, actor = "system") {
    const request = requestSchema.parse(input);
    const who = request.actor ?? actor;
    if (readVerbs.has(request.verb)) return this.dispatch(request);
    const started = Date.now();
    const entry = {
      actor: who,
      verb: request.verb,
      server:
        request.name ??
        (request.verb === "create-server" &&
        typeof (request.payload as { name?: unknown })?.name === "string"
          ? String((request.payload as { name: string }).name).slice(0, 24)
          : undefined),
      detail: auditDetail(request.verb, request.payload),
    };
    try {
      const result = await this.dispatch(request);
      await this.audit.record({ ...entry, outcome: "ok", durationMs: Date.now() - started });
      return result;
    } catch (e) {
      await this.audit.record({
        ...entry,
        outcome: "error",
        durationMs: Date.now() - started,
        error: e instanceof Error ? e.message : "Operation failed",
      });
      throw e;
    }
  }
  exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work);
    this.tail = result.catch(() => undefined);
    return result;
  }
  dispatch(input: unknown) {
    const request = requestSchema.parse(input);
    if (readVerbs.has(request.verb) || request.verb === "run-task")
      return this.action(request);
    const next = this.tail.then(() => this.action(request));
    this.tail = next.catch(() => undefined);
    return next;
  }
  private playerCache = new Map<
    string,
    { at: number; result: Promise<string | null> }
  >();
  async status(c: ServerConfig): Promise<ServerStatus> {
    const info = await this.docker.container(c.name, true);
    let players: string | null = null;
    if (info?.State.Running) {
      let cached = this.playerCache.get(c.name);
      if (!cached || Date.now() - cached.at >= 15000) {
        cached = {
          at: Date.now(),
          result: this.docker.rcon(c.name, "list").catch(() => null),
        };
        this.playerCache.set(c.name, cached);
      }
      players = await cached.result;
    }

    const desiredFile=join(await this.store.folder(c.name),"desired-state.json");
    const desired=await exists(desiredFile)?JSON.parse(await readFile(desiredFile,"utf8")).running!==false:true;
    return {
      ...c,
      state: reportedContainerState(info?.State,desired),
      players,
      metrics: await this.docker
        .metrics(c.name, c.memory + 512)
        .catch(() => undefined),
      fabricLoader: await this.management.loader(c.name),
      schedule: await this.tasks.legacyView(c.name),
      effectiveSchedule: await this.effectiveSchedule(c.name),
      lastExit:
        info && !info.State.Running && info.State.FinishedAt && !info.State.FinishedAt.startsWith("0001-")
          ? {
              exitCode: info.State.ExitCode ?? 0,
              finishedAt: info.State.FinishedAt,
              oomKilled: info.State.OOMKilled === true,
            }
          : undefined,
      restoreTest: await this.management.restoreTestInfo(c.name),
      backup: await this.backups.latest(c.name),
      joinAddress: this.addresses.joinDomain
        ? c.name + "." + this.addresses.joinDomain
        : undefined,
      dns: await this.dns.status(c.name, c.port).catch(() => ({
        status: "unconfigured" as const,
        recordName: this.dns.recordName(c.name),
      })),
      directAddress: this.addresses.directHost
        ? this.addresses.directHost + ":" + c.port
        : undefined,
    };
  }
  async effectiveSchedule(name: string) {
    const own = await this.tasks.legacyView(name);
    return {
      backupAt: own.backupAt ?? process.env.MC_GLOBAL_BACKUP_TIME ?? null,
      backupSource: own.backupAt ? ("server" as const) : ("global" as const),
      restartAt: own.restartAt,
      timezone: "UTC" as const,
    };
  }
  /** Checks typed name and a single-use intent, returning the payload without the token. */
  private authorize(action: DestructiveAction, name: string, payload: unknown) {
    const p = z
      .object({ confirm: z.literal(true), confirmName: z.string(), intent: z.string().optional() })
      .passthrough()
      .parse(payload);
    if (p.confirmName !== name) throw Error("Type the exact server name to confirm");
    this.intents.consume(action, name, p.intent);
    const { intent: _intent, ...rest } = p;
    return rest;
  }
  async renameServer(name: string, payload: unknown) {
    const p = z
      .object({
        newName: nameSchema,
        confirm: z.literal(true),
        confirmName: z.literal(name),
      })
      .strict()
      .parse(payload);
    if (p.newName === name) throw Error("Choose a different name");
    const c = await this.store.read(name);
    const old = await this.store.folder(name),
      next = await this.store.folder(p.newName);
    if (await exists(next)) throw Error("Server name already exists");
    await this.store.validate(
      { ...c, name: p.newName },
      false,
      name,
      await this.activeNames(),
    );
    await this.dns.available(p.newName);
    await this.backups.backup(name, "pre-rename");
    await this.dns.ensure(p.newName, c.port);
    const info = await this.docker.container(name, true);
    if (info) {
      if (info.State.Running) await this.docker.lifecycle("stop", name);
      await this.docker.run(["docker", "rm", info.Id]);
    }
    await rename(old, next);
    const updated = { ...c, name: p.newName };
    await this.store.write(updated);
    const aliasesFile = join(next, "backup-aliases.json");
    const aliases: string[] = (await exists(aliasesFile))
      ? JSON.parse(await readFile(aliasesFile, "utf8"))
      : [];
    await atomic(aliasesFile, [...new Set([...aliases, name])]);
    await this.docker.recreate(updated);
    await this.docker.waitReady(p.newName);
    await this.dns.remove(name);
    await this.backups.backup(p.newName, "post-rename");
    return this.status(updated);
  }
  async validate(c: ServerConfig, creating = false) {
    await this.store.validate(c, creating, undefined, await this.activeNames());
    const check = await this.upstream.check(c, c.version);
    if (c.javaTag !== check.javaTag)
      throw Error("Java image must match Minecraft release");
    if (check.projects.some((p) => !p.compatible))
      throw Error("Some projects have no compatible build");
    return c;
  }
  async action({ verb, name, payload = {} }: ControlRequest): Promise<unknown> {
    if (verb === "list") {
      const result: ServerStatus[] = [];
      for (const c of await this.store.list())
        result.push(await this.status(c));
      return result;
    }
    if (verb === "versions")
      return (await this.upstream.releases()).slice(0, 40).map((v) => v.id);
    if (verb === "limits") return this.store.limits;
    if (verb === "create-progress") {
      if (!name) throw Error("Server name required");
      return this.progress(name);
    }
    if (verb === "create-server") {
      const input = z
        .object({
          name: nameSchema,
          version: z.string().optional(),
          memory: z.number().int().optional(),
          port: z.number().int().optional(),
          mods: z.array(z.string()).optional(),
          datapacks: z.array(z.string()).default([]),
          seed: z.string().max(64).optional(),
          gamemode: z
            .enum(["survival", "creative", "adventure", "spectator"])
            .optional(),
          difficulty: z.enum(["peaceful", "easy", "normal", "hard"]).optional(),
          hardcore: z.boolean().optional(),
          levelType: z.enum(["normal", "flat", "large_biomes", "amplified"]).optional(),
        })
        .strict()
        .parse(payload);
      const name = input.name;
      this.creation.set(name, { phase: "validating" });
      try {
        const configs = await this.store.list();
        const dir = await this.store.folder(name);
        if (await exists(dir)) throw Error("Server already exists");
        const active = await this.activeNames();
        const available =
          this.store.limits.memoryBudget -
          configs
            .filter((c) => active.has(c.name))
            .reduce((n, c) => n + c.memory + 512, 0) -
          512;
        const memory =
          input.memory ??
          (available >= 2048 ? 2048 : available >= 1024 ? 1024 : 0);
        if (memory < 512)
          throw Error(
            "Memory budget is full. Stop another server to create a world.",
          );
        const version =
          input.version ?? (await this.upstream.releases())[0]?.id;
        if (!version) throw Error("No stable Minecraft version available");
        const reserved = join(this.store.root, "reserved-ports.json");
        const reservations: { port: number }[] = (await exists(reserved))
          ? JSON.parse(
              await import("node:fs/promises").then((fs) =>
                fs.readFile(reserved, "utf8"),
              ),
            )
          : [];
        const used = new Set([
          ...configs.map((c) => c.port),
          ...reservations.map((c) => c.port),
        ]);
        const port =
          input.port ??
          Array.from(
            {
              length: this.store.limits.portMax - this.store.limits.portMin + 1,
            },
            (_, i) => this.store.limits.portMin + i,
          ).find((p) => !used.has(p));
        if (port === undefined) throw Error("No free game port");
        const candidates =
          input.mods ??
          (
            process.env.MC_DEFAULT_MODS ||
            "lithium,ferrite-core,c2me-fabric,scalablelux,krypton"
          )
            .split(",")
            .filter(Boolean);
        const mods: string[] = [],
          omittedMods: string[] = [];
        for (const mod of candidates) {
          if ((await this.upstream.builds(mod, version, "mod")).length)
            mods.push(mod);
          else if (input.mods) throw Error("No compatible build for " + mod);
          else omittedMods.push(mod);
        }
        const c = {
          name,
          version,
          memory,
          port,
          mods,
          datapacks: input.datapacks,
          javaTag: await this.upstream.java(version),
        };
        await this.validate(c, true);
        await this.dns.available(name);
        this.creation.set(name, { phase: "dns" });
        await this.dns.ensure(name, port);
        await mkdir(join(dir, "data"), { recursive: true, mode: 0o700 });
        await this.store.write(c);
        await atomic(join(dir, "desired-state.json"), { running: true });
        await atomic(join(dir, "schedule.json"), {
          restartAt: null,
          backupAt: null,
        });
        this.creation.set(name, { phase: "container" });
        if (
          input.seed !== undefined ||
          input.gamemode ||
          input.difficulty ||
          input.hardcore !== undefined ||
          input.levelType
        ) {
          await this.docker.compose(c);
          const secret = (
            await readFile(join(dir, "rcon.secret"), "utf8")
          ).trim();
          await writeFile(
            join(dir, "data/server.properties"),
            serializeProperties({
              "server-port": "25565",
              "server-ip": "",
              "enable-rcon": "true",
              "rcon.port": "25575",
              "rcon.password": secret,
              "level-name": "world",
              "online-mode": "true",
              "max-players": "20",
              "view-distance": "10",
              "simulation-distance": "10",
              gamemode: input.gamemode ?? "survival",
              difficulty: input.hardcore ? "hard" : (input.difficulty ?? "normal"),
              hardcore: input.hardcore ? "true" : "false",
              "level-type": "minecraft:" + (input.levelType ?? "normal"),
              ...(input.seed !== undefined ? { "level-seed": input.seed } : {}),
            }),
            { mode: 0o600 },
          );
        }
        await this.docker.recreate(c);
        this.creation.set(name, { phase: "start" });
        await this.docker.waitReady(name);
        this.creation.set(name, { phase: "backup" });
        await this.backups.backup(name, "post-create");
        this.creation.set(name, { phase: "ready" });
        return { ...(await this.status(c)), omittedMods };
      } catch (e) {
        this.creation.set(name, {
          phase: "failed",
          error: e instanceof Error ? e.message : "Creation failed",
        });
        throw e;
      }
    }
    if (verb === "audit") {
      const p = z
        .object({
          limit: z.number().int().min(1).max(500).optional(),
          before: z.string().datetime().optional(),
        })
        .strict()
        .parse(payload);
      if (name) await this.store.read(name).catch(() => undefined);
      return this.audit.list({ server: name, ...p });
    }
    if (!name) throw Error("Server name required");
    const c = await this.store.read(name);
    if (verb === "confirm-intent") {
      const p = z.object({ action: z.enum(destructiveActions) }).strict().parse(payload);
      return this.intents.issue(p.action, name);
    }
    if (verb === "kill") {
      this.authorize("kill", name, payload);
      return this.management.handle("kill", name, { confirm: true });
    }
    if (verb === "reset-world" || verb === "restore-backup")
      return this.management.handle(verb, name, this.authorize(verb, name, payload));
    if (verb === "delete-server")
      return this.management.worlds.removeServer(
        name,
        this.authorize("delete-server", name, payload),
        () => this.dns.remove(name),
      );
    const files = this.management.files;
    if (verb === "make-directory") {
      const p = z.object({ path: pathSchema }).strict().parse(payload);
      return files.makeDirectory(name, p.path);
    }
    if (verb === "rename-file") {
      const p = z.object({ from: pathSchema, to: pathSchema }).strict().parse(payload);
      return files.renamePath(name, p.from, p.to);
    }
    if (verb === "archive-files") {
      const p = z
        .object({ paths: z.array(pathSchema).min(1).max(200), destination: pathSchema })
        .strict()
        .parse(payload);
      return files.archive(name, p.paths, p.destination);
    }
    if (verb === "extract-archive") {
      const p = z.object({ path: pathSchema, destination: pathSchema }).strict().parse(payload);
      return files.extract(name, p.path, p.destination);
    }
    if (verb === "read-log") {
      const p = z.object({ file: z.string().max(128) }).strict().parse(payload);
      return files.readLog(name, p.file);
    }
    if (verb === "tasks")
      return {
        tasks: (await this.tasks.list(name)).map((t) => this.tasks.view(t)),
        timezone: "UTC" as const,
        globalBackupAt: process.env.MC_GLOBAL_BACKUP_TIME ?? null,
      };
    if (verb === "save-task") {
      const p = z.object({ task: z.unknown() }).strict().parse(payload);
      return this.tasks.save(name, p.task);
    }
    if (verb === "delete-task") {
      const p = z.object({ id: z.string(), confirm: z.literal(true) }).strict().parse(payload);
      return this.tasks.remove(name, p.id);
    }
    if (verb === "run-task") {
      const p = z.object({ id: z.string() }).strict().parse(payload);
      const task = await this.tasks.get(name, p.id);
      void runTask(this, name, task)
        .then(() => this.tasks.update(name, task.id, { lastRun: { at: new Date().toISOString(), ok: true } }))
        .catch((e) =>
          this.tasks.update(name, task.id, {
            lastRun: {
              at: new Date().toISOString(),
              ok: false,
              error: e instanceof Error ? e.message.slice(0, 200) : "Task failed",
            },
          }),
        );
      return { ok: true, started: true };
    }
    if (verb === "schedule") {
      // Legacy verb: maps HH:MM settings onto the first daily restart/backup task.
      const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).nullable().optional();
      const p = z.object({ restartAt: time, backupAt: time }).strict().parse(payload);
      const tasks = await this.tasks.list(name);
      for (const [key, kind] of [["restartAt", "restart"], ["backupAt", "backup"]] as const) {
        if (p[key] === undefined) continue;
        const existing = tasks.find((t) => t.kind === kind && !t.days.length);
        if (p[key] === null) {
          if (existing) await this.tasks.remove(name, existing.id);
        } else
          await this.tasks.save(name, {
            ...(existing ? { id: existing.id } : {}),
            kind,
            time: p[key],
            days: [],
            enabled: true,
            ...(kind === "restart" ? { warnMinutes: existing?.warnMinutes ?? 0 } : {}),
          });
      }
      return this.tasks.legacyView(name);
    }
    if (verb === "loader-versions") {
      const installed = await this.management.loader(name);
      const versions = await this.upstream.json<
        { loader: { version: string } }[]
      >(
        "https://meta.fabricmc.net/v2/versions/loader/" +
          encodeURIComponent(c.version),
      );
      const compare = (a: string, b: string) => {
        const aa = a.split(".").map(Number),
          bb = b.split(".").map(Number);
        for (let i = 0; i < 3; i++) {
          if (aa[i] !== bb[i]) return aa[i] - bb[i];
        }
        return 0;
      };
      return [...new Set(versions.map((v) => v.loader.version))]
        .filter(
          (v) =>
            /^\d+\.\d+\.\d+$/.test(v) &&
            (!installed || compare(v, installed) >= 0),
        )
        .sort((a, b) => compare(b, a));
    }
    if (verb === "mods-details") return projectDetails(this.docker, c);
    if (verb === "dns-status") return this.dns.status(name, c.port);
    if (verb === "fix-dns") {
      z.object({ confirm: z.literal(true) })
        .strict()
        .parse(payload);
      return this.dns.ensure(name, c.port);
    }
    if (verb === "rename-server") return this.renameServer(name, payload);
    if (managementVerbs.includes(verb as (typeof managementVerbs)[number]))
      return this.management.handle(verb, name, payload);
    if (verb === "status") return this.status(c);
    if (verb === "logs") return { text: await this.docker.logs(name) };
    if (verb === "backups") return this.backups.list(name);
    if (verb === "pin-backup") {
      const p=z.object({snapshot:z.string(),pinned:z.boolean()}).strict().parse(payload);
      return this.backups.pin(name,p.snapshot,p.pinned);
    }
    if (verb === "rcon")
      return {
        text: await this.docker.rcon(
          name,
          z.object({ command: z.string() }).strict().parse(payload).command,
        ),
      };
    if (verb === "start" || verb === "stop" || verb === "restart") {
      await atomic(join(await this.store.folder(name), "desired-state.json"), {
        running: verb !== "stop",
      });
      if (verb === "start" && !(await this.docker.container(name, true))) {
        await this.dns.ensure(name, c.port);
        await this.docker.recreate(c);
      } else await this.docker.lifecycle(verb, name);
      return this.status(c);
    }
    if (verb === "backup-now")
      return this.backups.backup(
        name,
        z
          .object({ reason: z.enum(["daily", "manual"]).default("manual") })
          .strict()
          .parse(payload).reason,
      );
    if (verb === "check-upgrade" || verb === "check-updates") {
      const input = z
        .object({ version: z.string().optional() })
        .strict()
        .parse(payload);
      const version = input.version ?? c.version;
      await this.upstream.noDowngrade(c.version, version);
      return this.upstream.check(c, version);
    }
    if (verb === "apply-config") {
      const patch = patchSchema.parse(payload);
      const updated = { ...c, ...patch };
      await this.upstream.noDowngrade(c.version, updated.version);
      updated.javaTag = await this.upstream.java(updated.version);
      await this.validate(updated);
      await this.backups.backup(
        name,
        updated.version !== c.version ? "pre-upgrade" : "pre-config",
      );
      await this.store.write(updated);
      await this.docker.recreate(updated);
      return this.status(updated);
    }
    if (verb === "upload-datapack") {
      const input = z
        .object({
          filename: z.string().regex(/^[a-zA-Z0-9_.-]+\.zip$/),
          data: z.string().max(24 * 1024 * 1024),
        })
        .strict()
        .parse(payload);
      const data = Buffer.from(input.data, "base64");
      if (data.length > 16 * 1024 * 1024)
        throw Error("Datapack exceeds 16 MiB");
      const zip = new ZipReader(new BlobReader(new Blob([data])));
      try {
        const entries = await zip.getEntries();
        if (
          !entries.some((e) => e.filename === "pack.mcmeta") ||
          entries.reduce((n, e) => n + e.uncompressedSize, 0) >
            128 * 1024 * 1024
        )
          throw Error("Invalid datapack");
        if (
          entries.some(
            (e) =>
              e.filename.startsWith("/") ||
              e.filename.includes("\\") ||
              e.filename.split("/").includes(".."),
          )
        )
          throw Error("Unsafe datapack paths");
      } finally {
        await zip.close();
      }
      const dir = join(await this.store.folder(name), "data/world/datapacks");
      const dest = join(dir, input.filename);
      if (await exists(dest)) throw Error("Datapack already exists");
      await this.backups.backup(name, "pre-datapack-upload");
      await mkdir(dir, { recursive: true, mode: 0o700 });
      await writeFile(dest, data, { mode: 0o600, flag: "wx" });
      return {
        uploaded: input.filename,
        note: "Reload or restart to load the datapack",
      };
    }
    throw Error("Unknown verb");
  }
}
