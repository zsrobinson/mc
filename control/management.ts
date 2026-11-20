import { readFile, readdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { Docker } from "./docker";
import { Backups } from "./backups";
import { Properties } from "./properties";
import { Files, pathSchema } from "./files";
import { Players } from "./players";
import { Worlds } from "./worlds";
import { atomic, exists } from "./config";
export const managementVerbs = [
  "kill",
  "players",
  "player-action",
  "properties",
  "apply-properties",
  "set-loader",
  "files",
  "read-file",
  "write-file",
  "delete-file",
  "logs-list",
  "reset-world",
  "restore-backup",
  "restore-test",
  "delete-server",
  "schedule",
] as const;
export class Management {
  readonly properties: Properties;
  readonly files: Files;
  readonly players: Players;
  readonly worlds: Worlds;
  constructor(
    readonly docker: Docker,
    readonly backups: Backups,
  ) {
    this.properties = new Properties(docker.store);
    this.files = new Files(docker.store, this.properties);
    this.players = new Players(docker, this.properties, docker.upstream);
    this.worlds = new Worlds(docker, backups, this.properties);
  }
  async schedule(name: string) {
    const path = join(await this.docker.store.folder(name), "schedule.json");
    return (await exists(path))
      ? (JSON.parse(await readFile(path, "utf8")) as {
          restartAt?: string | null;
          backupAt?: string | null;
        })
      : {};
  }
  async loader(name: string) {
    const config = await this.docker.store.read(name);
    if (config.fabricLoader) return config.fabricLoader;
    const dir = join(await this.docker.store.folder(name), "data");
    const files = await readdir(dir);
    return files.map((f) => f.match(/-loader\.([0-9.]+)-/)).find(Boolean)?.[1];
  }
  async handle(verb: string, name: string, payload: unknown): Promise<unknown> {
    const confirm = () =>
      z
        .object({ confirm: z.literal(true) })
        .passthrough()
        .parse(payload);
    if (verb === "kill") {
      confirm();
      await atomic(
        join(await this.docker.store.folder(name), "desired-state.json"),
        { running: false },
      );
      await this.docker.kill(name);
      return { killed: true };
    }
    if (verb === "players") return this.players.list(name);
    if (verb === "player-action") return this.players.action(name, payload);
    if (verb === "properties") return this.properties.get(name);
    if (verb === "apply-properties") {
      confirm();
      const p = z
        .object({
          values: z
            .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
            .optional(),
          raw: z
            .string()
            .max(128 * 1024)
            .optional(),
          confirm: z.literal(true),
        })
        .strict()
        .parse(payload);
      await this.backups.backup(name, "pre-destructive");
      const info = await this.docker.container(name, true);
      if (info?.State.Running) await this.docker.lifecycle("stop", name);
      await this.properties.set(name, p);
      await this.docker.recreate(await this.docker.store.read(name));
      return this.properties.get(name);
    }
    if (verb === "set-loader") {
      const p = z
        .object({
          loader: z.string().regex(/^\d+\.\d+\.\d+$/),
          confirm: z.literal(true),
        })
        .strict()
        .parse(payload);
      const c = await this.docker.store.read(name);
      const loaders = await this.docker.upstream.json<
        { loader: { version: string } }[]
      >(
        "https://meta.fabricmc.net/v2/versions/loader/" +
          encodeURIComponent(c.version),
      );
      if (!loaders.some((l) => l.loader.version === p.loader))
        throw Error("Fabric loader does not support this Minecraft version");
      await this.backups.backup(name, "pre-destructive");
      const updated = { ...c, fabricLoader: p.loader };
      await this.docker.store.write(updated);
      await this.docker.recreate(updated);
      return { loader: p.loader };
    }
    if (verb === "files") {
      const p = z
        .object({ path: pathSchema.optional() })
        .strict()
        .parse(payload);
      return this.files.list(name, p.path);
    }
    if (verb === "read-file") {
      const p = z.object({ path: pathSchema }).strict().parse(payload);
      return this.files.read(name, p.path);
    }
    if (verb === "write-file") {
      const p = z
        .object({
          path: pathSchema,
          text: z.string().max(512 * 1024),
          confirm: z.literal(true),
        })
        .strict()
        .parse(payload);
      await this.backups.backup(name, "pre-destructive");
      return this.files.write(name, p.path, p.text);
    }
    if (verb === "delete-file") {
      const p = z
        .object({ path: pathSchema, confirm: z.literal(true) })
        .strict()
        .parse(payload);
      await this.backups.backup(name, "pre-destructive");
      return this.files.remove(name, p.path);
    }
    if (verb === "logs-list") return this.files.logs(name);
    if (verb === "reset-world") return this.worlds.reset(name, payload);
    if (verb === "restore-backup") {
      const p = z
        .object({
          snapshot: z.string(),
          confirm: z.literal(true),
          confirmName: z.string(),
        })
        .strict()
        .parse(payload);
      return this.worlds.restore(name, p.snapshot, p);
    }
    if (verb === "restore-test") {
      const p = z
        .object({ snapshot: z.string().optional() })
        .strict()
        .parse(payload);
      return this.worlds.restoreTest(name, p.snapshot);
    }
    if (verb === "delete-server")
      return this.worlds.removeServer(name, payload);
    if (verb === "schedule") {
      const time = z
        .string()
        .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
        .nullable()
        .optional();
      const p = z
        .object({ restartAt: time, backupAt: time })
        .strict()
        .parse(payload);
      await atomic(
        join(await this.docker.store.folder(name), "schedule.json"),
        { ...(await this.schedule(name)), ...p },
      );
      return this.schedule(name);
    }
    throw Error("Unknown management verb");
  }
  async upload(
    verb: string,
    name: string,
    temp: string,
    query: Record<string, string>,
  ) {
    await this.docker.store.read(name);
    if (verb === "upload-world")
      return this.worlds.replace(name, temp, {
        confirm: query.confirm === "true",
        confirmName: query.confirmName,
      });
    if (verb === "upload-icon") {
      if (query.confirm !== "true") throw Error("Confirmation required");
      const data = await readFile(temp);
      if (
        data.length > 256 * 1024 ||
        data.length < 24 ||
        !data
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        data.readUInt32BE(16) !== 64 ||
        data.readUInt32BE(20) !== 64
      )
        throw Error("Server icon must be a 64 × 64 PNG");
      await this.backups.backup(name, "pre-destructive");
      await copyFile(
        temp,
        join(await this.docker.store.folder(name), "data/server-icon.png"),
      );
      return { uploaded: "server-icon.png", restartRequired: true };
    }
    if (verb === "upload-file") {
      if (query.confirm !== "true") throw Error("Confirmation required");
      await this.backups.backup(name, "pre-destructive");
      return this.files.upload(name, query.path || "", temp);
    }
    throw Error("Unknown upload verb");
  }
  async download(verb: string, name: string, query: Record<string, string>) {
    await this.docker.store.read(name);
    if (verb === "download-world") return this.worlds.zip(name);
    if (verb === "download-file")
      return this.files.download(name, query.path || "");
    if (verb === "download-log") {
      const path = query.path || "latest.log";
      if (!/^[-a-zA-Z0-9_.]+\.(log|gz)$/.test(path))
        throw Error("Invalid log filename");
      return this.files.download(name, "logs/" + path);
    }
    if (verb === "download-backup") {
      const snapshot = query.snapshot;
      if (!(await this.backups.list(name)).some((s) => s.id === snapshot))
        throw Error("Snapshot not found");
      return {
        file: join(this.backups.root, name, snapshot, "world.tar.gz"),
        filename: name + "-" + snapshot + ".tar.gz",
        type: "application/gzip",
      };
    }
    throw Error("Unknown download verb");
  }
}
