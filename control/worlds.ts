import { secretPath } from "./secrets";
import { secureOpen } from "./paths";
import { Reader, ZipReader, ZipWriter, configure } from "@zip.js/zip.js";
import { createReadStream, createWriteStream } from "node:fs";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  rename,
  open,
  mkdtemp,
} from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { Readable, Writable } from "node:stream";
import { join, dirname, resolve } from "node:path";
import { randomUUID, createHash, randomBytes } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { read as readNbt } from "nbtify";
import * as tar from "tar";
import { z } from "zod";
import { Docker } from "./docker";
import { Backups } from "./backups";
import { Properties, serializeProperties } from "./properties";
import { configSchema, exists } from "./config";
configure({ useWebWorkers: false });
class DiskReader extends Reader<FileHandle> {
  constructor(
    readonly handle: FileHandle,
    size: number,
  ) {
    super(handle);
    this.size = size;
  }
  async readUint8Array(index: number, length: number) {
    const data = Buffer.alloc(Math.min(length, this.size - index));
    let offset = 0;
    while (offset < data.length) {
      const r = await this.handle.read(
        data,
        offset,
        data.length - offset,
        index + offset,
      );
      if (!r.bytesRead) break;
      offset += r.bytesRead;
    }
    return data.subarray(0, offset);
  }
}
export const confirmation = z.object({
  confirm: z.literal(true),
  confirmName: z.string(),
});
export function confirmed(name: string, payload: unknown) {
  const c = confirmation.passthrough().parse(payload);
  if (c.confirmName !== name)
    throw Error("Type the exact server name to confirm");
  return c;
}
export class Worlds {
  constructor(
    readonly docker: Docker,
    readonly backups: Backups,
    readonly properties: Properties,
  ) {}
  async stage(name: string, prefix: string) {
    const dir = join(await this.docker.store.folder(name), "staging");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    return mkdtemp(join(dir, prefix + "-"));
  }
  async meta(path: string, root = dirname(path)) {
    const handle = await secureOpen(root, path);
    let data: Buffer;
    try {
      if ((await handle.stat()).size > 8 * 1024 * 1024)
        throw Error("World metadata too large");
      data = await handle.readFile();
    } finally {
      await handle.close();
    }
    if (data.length > 8 * 1024 * 1024)
      throw Error("World metadata is too large");
    const plain =
      data[0] === 0x1f && data[1] === 0x8b
        ? gunzipSync(data, { maxOutputLength: 64 * 1024 * 1024 })
        : data;
    const result = (await readNbt(plain)) as unknown as {
      data: {
        Data?: {
          Version?: { Name?: string };
          WorldGenSettings?: { seed?: bigint | number };
          RandomSeed?: bigint | number;
        };
      };
    };
    if (!result.data.Data) throw Error("Invalid Minecraft world metadata");
    return result.data.Data;
  }
  async extractWorld(name: string, file: string) {
    const stage = await this.stage(name, "world");
    const handle = await open(file, "r");
    const zip = new ZipReader(
      new DiskReader(handle, (await handle.stat()).size),
    );
    try {
      const entries = await zip.getEntries();
      if (
        entries.length > 100000 ||
        entries.reduce((n, e) => n + e.uncompressedSize, 0) > 8 * 1024 ** 3
      )
        throw Error("World archive is too large");
      const levels = entries.filter(
        (e) =>
          e.filename === "level.dat" || /^[^/]+\/level\.dat$/.test(e.filename),
      );
      if (levels.length !== 1)
        throw Error("Archive must contain one normal world with level.dat");
      const prefix = levels[0].filename.slice(0, -"level.dat".length);
      const seen = new Set<string>();
      for (const entry of entries) {
        if (!entry.filename.startsWith(prefix)) continue;
        const path = entry.filename.slice(prefix.length);
        if (!path) continue;
        if (
          path.startsWith("/") ||
          path.includes("\\") ||
          path.split("/").includes("..") ||
          ((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000
        )
          throw Error("Unsafe archive path");
        if (seen.has(path)) throw Error("Duplicate archive path");
        seen.add(path);
        const dest = resolve(stage, path);
        if (!dest.startsWith(stage + "/")) throw Error("Unsafe archive path");
        if (entry.directory) {
          await mkdir(dest, { recursive: true, mode: 0o700 });
          continue;
        }
        await mkdir(dirname(dest), { recursive: true, mode: 0o700 });
        await entry.getData(
          Writable.toWeb(createWriteStream(dest, { flags: "wx", mode: 0o600 })),
        );
      }
      const meta = await this.meta(join(stage, "level.dat"));
      return { stage, meta };
    } finally {
      await zip.close();
      await handle.close();
    }
  }
  async retainWorld(name: string) {
    const dir = await this.docker.store.folder(name);
    const world = join(dir, "data/world");
    if (await exists(world)) {
      const retained = join(dir, "retained-worlds", randomUUID());
      await mkdir(dirname(retained), { recursive: true, mode: 0o700 });
      await rename(world, retained);
    }
  }
  async replace(name: string, file: string, payload: unknown) {
    confirmed(name, payload);
    const c = await this.docker.store.read(name);
    const { stage, meta } = await this.extractWorld(name, file);
    if (meta.Version?.Name)
      await this.docker.upstream.noDowngrade(meta.Version.Name, c.version);
    await this.backups.backup(name, "pre-destructive");
    const info = await this.docker.container(name, true);
    if (info?.State.Running) await this.docker.lifecycle("stop", name);
    await this.retainWorld(name);
    await rename(
      stage,
      join(await this.docker.store.folder(name), "data/world"),
    );
    await this.docker.recreate(c);
    return { replaced: true };
  }
  async reset(name: string, payload: unknown) {
    confirmed(name, payload);
    const input = z
      .object({
        seed: z.string().max(64).optional(),
        sameSeed: z.boolean().optional(),
        confirm: z.literal(true),
        confirmName: z.string(),
      })
      .strict()
      .parse(payload);
    const dir = await this.docker.store.folder(name);
    let seed = input.seed ?? "";
    if (input.sameSeed) {
      const meta = await this.meta(
        join(dir, "data/world/level.dat"),
        join(dir, "data"),
      );
      const original = meta.WorldGenSettings?.seed ?? meta.RandomSeed;
      if (original === undefined) throw Error("World seed unavailable");
      seed = String(original);
    }
    await this.backups.backup(name, "pre-destructive");
    const info = await this.docker.container(name, true);
    if (info?.State.Running) await this.docker.lifecycle("stop", name);
    await this.retainWorld(name);
    const props = await this.properties.internal(name);
    props.values["level-seed"] = seed;
    await writeFile(props.path, serializeProperties(props.values), {
      mode: 0o600,
    });
    await this.docker.recreate(await this.docker.store.read(name));
    return { reset: true };
  }
  async info(name: string) {
    const root = join(await this.docker.store.folder(name), "data");
    let bytes = 0,
      modified = 0;
    const walk = async (path: string) => {
      const handle = await secureOpen(root, path, true);
      try {
        const base = "/proc/self/fd/" + handle.fd;
        for (const entry of await readdir(base, { withFileTypes: true })) {
          if (entry.isSymbolicLink()) continue;
          const next = base + "/" + entry.name;
          if (entry.isDirectory()) await walk(next);
          else if (entry.isFile()) {
            const file = await secureOpen(root, next);
            try {
              const info = await file.stat();
              bytes += info.size;
              modified = Math.max(modified, info.mtimeMs);
            } finally {
              await file.close();
            }
          }
        }
      } finally {
        await handle.close();
      }
    };
    await walk(join(root, "world"));
    const meta = await this.meta(join(root, "world/level.dat"), root);
    return {
      bytes,
      modifiedAt: new Date(modified).toISOString(),
      version: meta.Version?.Name,
    };
  }
  async zip(name: string) {
    const info = await this.docker.container(name, true);
    const live = info?.State.Running;
    const stage = await this.stage(name, "download");
    const path = join(stage, "world.zip");
    try {
      if (live) {
        await this.docker.rcon(name, "save-off");
        await this.docker.rcon(name, "save-all flush");
      }
      const writer = new ZipWriter(
        Writable.toWeb(createWriteStream(path, { mode: 0o600 })),
        { level: 1 },
      );
      const root = join(await this.docker.store.folder(name), "data/world");
      const dataRoot = join(await this.docker.store.folder(name), "data");
      const walk = async (dir: string, prefix: string) => {
        const directory = await secureOpen(dataRoot, dir, true);
        try {
          const base = "/proc/self/fd/" + directory.fd;
          for (const item of await readdir(base, { withFileTypes: true })) {
            if (secretPath(item.name)) continue;
            if (item.isSymbolicLink())
              throw Error("World contains a symbolic link");
            const source = base + "/" + item.name,
              target = prefix + item.name;
            if (item.isDirectory()) await walk(source, target + "/");
            else if (item.isFile()) {
              const file = await secureOpen(dataRoot, source);
              await writer.add(
                target,
                Readable.toWeb(
                  file.createReadStream(),
                ) as ReadableStream<Uint8Array>,
              );
            }
          }
        } finally {
          await directory.close();
        }
      };

      await walk(root, "world/");
      await writer.close();
      return {
        file: path,
        filename: name + "-world.zip",
        type: "application/zip",
        temporary: true,
      };
    } finally {
      if (live) await this.docker.rcon(name, "save-on");
    }
  }
  async restore(name: string, snapshot: string, payload: unknown) {
    confirmed(name, payload);
    const list = await this.backups.list(name);
    const selected = list.find((s) => s.id === snapshot);
    if (!selected) throw Error("Snapshot not found");
    const base = join(this.backups.root, selected.sourceName ?? name, snapshot);
    const archive = join(base, "world.tar.gz");
    const expected = (await readFile(join(base, "SHA256SUMS"), "utf8")).split(
      /\s+/,
    )[0];
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(archive)) hash.update(chunk);
    if (hash.digest("hex") !== expected)
      throw Error("Backup checksum mismatch");
    const stage = await this.stage(name, "restore");
    let bytes = 0;
    const filter = (
      path: string,
      entry: tar.ReadEntry | import("node:fs").Stats,
    ) => {
      if (
        path.startsWith("/") ||
        path.split("/").includes("..") ||
        !("type" in entry) ||
        !["File", "Directory"].includes(entry.type)
      )
        throw Error("Unsafe backup entry");
      bytes += entry.size;
      if (bytes > 16 * 1024 ** 3) throw Error("Backup expansion exceeds limit");
      return true;
    };
    await tar.x({ file: archive, cwd: stage, strict: true, filter });
    const c = configSchema.parse(
      JSON.parse(await readFile(join(stage, "config.json"), "utf8")),
    );
    if (c.name !== name && c.name !== selected.sourceName)
      throw Error("Backup belongs to a different server");
    c.name = name;
    await this.docker.store.validate(
      c,
      false,
      undefined,
      await this.docker.activeNames(),
    );
    if (c.javaTag !== (await this.docker.upstream.java(c.version)))
      throw Error("Backup Java mismatch");
    await this.backups.backup(name, "pre-destructive");
    const info = await this.docker.container(name, true);
    if (info?.State.Running) await this.docker.lifecycle("stop", name);
    const dir = await this.docker.store.folder(name);
    const retained = join(dir, "retained-restores", randomUUID());
    await mkdir(retained, { recursive: true, mode: 0o700 });
    for (const part of [
      "data",
      "config.json",
      "rcon.secret",
      "managed-datapacks.json",
      "schedule.json",
    ]) {
      if (await exists(join(dir, part)))
        await rename(join(dir, part), join(retained, part));
      if (await exists(join(stage, part)))
        await rename(join(stage, part), join(dir, part));
    }
    const secret = randomBytes(32).toString("hex");
    await writeFile(join(dir, "rcon.secret"), secret, { mode: 0o600 });
    const props = await this.properties.internal(name);
    props.values["rcon.password"] = secret;
    await writeFile(props.path, serializeProperties(props.values), {
      mode: 0o600,
    });
    await this.docker.recreate(c);
    return { restored: snapshot };
  }
  async restoreTest(name: string, snapshot?: string) {
    const list = await this.backups.list(name);
    const selected = list.find((s) =>
      snapshot ? s.id === snapshot : s.replicated,
    );
    if (!selected) throw Error("Verified snapshot not found");
    const base = join(
      this.backups.root,
      selected.sourceName ?? name,
      selected.id,
    );
    const archive = join(base, "world.tar.gz");
    const expected = (await readFile(join(base, "SHA256SUMS"), "utf8")).split(
      /\s+/,
    )[0];
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(archive)) hash.update(chunk);
    if (hash.digest("hex") !== expected)
      throw Error("Backup checksum mismatch");
    const stage = await this.stage(name, "restore-test");
    const marker = join(
      await this.docker.store.folder(name),
      "restore-test.json",
    );
    try {
      let bytes = 0;
      await tar.x({
        file: archive,
        cwd: stage,
        strict: true,
        filter: (path, entry) => {
          if (
            path.startsWith("/") ||
            path.split("/").includes("..") ||
            !("type" in entry) ||
            !["File", "Directory"].includes(entry.type)
          )
            throw Error("Unsafe backup entry");
          bytes += entry.size;
          if (bytes > 16 * 1024 ** 3)
            throw Error("Backup expansion exceeds limit");
          return true;
        },
      });
      if (await exists(join(stage, "rcon.secret")))
        throw Error("Backup contains an RCON secret");
      const properties = await readFile(
        join(stage, "data/server.properties"),
        "utf8",
      );
      const currentSecret = (
        await readFile(
          join(await this.docker.store.folder(name), "rcon.secret"),
          "utf8",
        )
      ).trim();
      if (properties.includes(currentSecret))
        throw Error("Backup contains RCON credentials");
      const meta = await this.meta(join(stage, "data/world/level.dat"));
      let regions = 0;
      const walk = async (path: string) => {
        for (const entry of await readdir(path, { withFileTypes: true })) {
          if (entry.isDirectory()) await walk(join(path, entry.name));
          else if (entry.name.endsWith(".mca")) regions++;
        }
      };
      await walk(join(stage, "data/world"));
      if (regions === 0) throw Error("Restored world has no region files");
      const result = {
        at: Date.now() / 1000,
        snapshot: selected.id,
        ok: true,
        regionFiles: regions,
        version: meta.Version?.Name ?? null,
        scratch: stage,
      };
      await writeFile(marker, JSON.stringify(result, null, 2) + "\n", {
        mode: 0o600,
      });
      return result;
    } catch (e) {
      await writeFile(
        marker,
        JSON.stringify({
          at: Date.now() / 1000,
          snapshot: selected.id,
          ok: false,
        }) + "\n",
        { mode: 0o600 },
      );
      throw e;
    }
  }
  async removeServer(
    name: string,
    payload: unknown,
    beforeRetain?: () => Promise<unknown>,
  ) {
    confirmed(name, payload);
    await this.backups.backup(name, "pre-destructive");
    if (beforeRetain) await beforeRetain();
    const info = await this.docker.container(name, true);
    if (info) {
      if (info.State.Running) await this.docker.lifecycle("stop", name);
      await this.docker.run(["docker", "rm", info.Id]);
    }
    const dir = await this.docker.store.folder(name);
    const retained = join(
      this.docker.store.root,
      ".retired",
      name + "-" + randomUUID(),
    );
    await mkdir(dirname(retained), { recursive: true, mode: 0o700 });
    await rename(dir, retained);
    return { deleted: true, retained: true };
  }
}
