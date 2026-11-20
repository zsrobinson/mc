import { projectDetails } from "./projects";
import { serializeProperties } from "./properties";
import { mkdir, writeFile, rename, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { ConfigStore, patchSchema, nameSchema, exists, atomic } from "./config";
import { Docker } from "./docker";
import { Upstream } from "./upstream";
import { Backups } from "./backups";
import type { ServerConfig, ServerStatus } from "../src/domain";
// zip.js reads metadata without extracting paths or executing archive content.
import { Management, managementVerbs } from "./management";
import { Dns } from "./dns";
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
    ]),
    name: nameSchema.optional(),
    payload: z.unknown().optional(),
  })
  .strict();
export type ControlRequest = z.infer<typeof requestSchema>;
export class Control {
  readonly management: Management;
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
  }
  exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work);
    this.tail = result.catch(() => undefined);
    return result;
  }
  dispatch(input: unknown) {
    const request = requestSchema.parse(input);
    if (
      [
        "list",
        "status",
        "versions",
        "limits",
        "logs",
        "backups",
        "players",
        "properties",
        "files",
        "read-file",
        "logs-list",
        "dns-status",
        "check-upgrade",
        "check-updates",
        "create-progress",
        "mods-details",
        "loader-versions",
        "world-info",
      ].includes(request.verb)
    )
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

    return {
      ...c,
      state: info?.State.Status ?? "absent",
      players,
      metrics: await this.docker
        .metrics(c.name, c.memory + 512)
        .catch(() => undefined),
      fabricLoader: await this.management.loader(c.name),
      schedule: await this.management.schedule(c.name),
      effectiveSchedule: await this.management.effectiveSchedule(c.name),
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
        if (input.seed !== undefined || input.gamemode || input.difficulty) {
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
              difficulty: input.difficulty ?? "normal",
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
    if (!name) throw Error("Server name required");
    const c = await this.store.read(name);
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
    if (verb === "delete-server")
      return this.management.worlds.removeServer(name, payload, () =>
        this.dns.remove(name),
      );
    if (verb === "rename-server") return this.renameServer(name, payload);
    if (managementVerbs.includes(verb as (typeof managementVerbs)[number]))
      return this.management.handle(verb, name, payload);
    if (verb === "status") return this.status(c);
    if (verb === "logs") return { text: await this.docker.logs(name) };
    if (verb === "backups") return this.backups.list(name);
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
