import { mkdir, writeFile } from "node:fs/promises";
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
    const next = this.tail.then(() => this.action(request));
    this.tail = next.catch(() => undefined);
    return next;
  }
  async status(c: ServerConfig): Promise<ServerStatus> {
    const info = await this.docker.container(c.name, true);
    let players: string | null = null;
    if (info?.State.Running) {
      try {
        players = await this.docker.rcon(c.name, "list");
      } catch {
        /* Status remains available while RCON reconnects. */
      }
    }
    return {
      ...c,
      state: info?.State.Status ?? "absent",
      players,
      metrics: await this.docker.metrics(c.name, c.memory + 512),
      fabricLoader: await this.management.loader(c.name),
      schedule: await this.management.schedule(c.name),
      backup: await this.backups.latest(c.name),
      joinAddress: this.addresses.joinDomain
        ? c.name + "." + this.addresses.joinDomain
        : undefined,
      directAddress: this.addresses.directHost
        ? this.addresses.directHost + ":" + c.port
        : undefined,
    };
  }
  async validate(c: ServerConfig, creating = false) {
    await this.store.validate(c, creating);
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
    if (verb === "create-server") {
      const input = z
        .object({
          name: nameSchema,
          version: z.string(),
          memory: z.number(),
          port: z.number().optional(),
          mods: z.array(z.string()).default([]),
          datapacks: z.array(z.string()).default([]),
        })
        .strict()
        .parse(payload);
      const used = new Set((await this.store.list()).map((c) => c.port));
      const port =
        input.port ??
        Array.from(
          { length: this.store.limits.portMax - this.store.limits.portMin + 1 },
          (_, i) => this.store.limits.portMin + i,
        ).find((p) => !used.has(p));
      if (port === undefined) throw Error("No free game port");
      const c = {
        ...input,
        port,
        javaTag: await this.upstream.java(input.version),
      };
      const dir = await this.store.folder(c.name);
      if (await exists(dir)) throw Error("Server already exists");
      await this.validate(c, true);
      await mkdir(join(dir, "data"), { recursive: true, mode: 0o700 });
      await this.store.write(c);
      await this.dns.ensure(c.name, c.port);
      await atomic(
        join(await this.store.folder(c.name), "desired-state.json"),
        { running: true },
      );
      await this.docker.recreate(c);
      return this.status(c);
    }
    if (!name) throw Error("Server name required");
    const c = await this.store.read(name);
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
