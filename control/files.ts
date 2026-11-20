import { secretPath } from "./secrets";
import { secureOpen } from "./paths";
import { atomicText } from "./config";
import { constants } from "node:fs";
import {
  lstat,
  readdir,
  realpath,
  mkdir,
  rename,
  stat,
  copyFile,
} from "node:fs/promises";
import { join, resolve, relative, dirname, extname, basename } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ConfigStore, exists } from "./config";
import { Properties } from "./properties";
export const pathSchema = z
  .string()
  .max(512)
  .refine(
    (p) =>
      !p.includes("\0") &&
      !p.includes("\\") &&
      !p.startsWith("/") &&
      !p.split("/").includes(".."),
    "Invalid relative path",
  );
const textExtensions = new Set([
  ".json",
  ".properties",
  ".txt",
  ".toml",
  ".yaml",
  ".yml",
  ".conf",
  ".cfg",
  ".ini",
  ".mcmeta",
]);
export class Files {
  constructor(
    readonly store: ConfigStore,
    readonly properties: Properties,
  ) {}
  async path(name: string, input: string, creating = false) {
    pathSchema.parse(input);
    if (secretPath(input))
      throw Error("Secret files are not exposed by the helper");
    const root = join(await this.store.folder(name), "data");
    const result = resolve(root, input || ".");
    if (result !== root && !result.startsWith(root + "/"))
      throw Error("Path outside server data");
    let current = root;
    for (const part of relative(root, result).split("/").filter(Boolean)) {
      current = join(current, part);
      if (!(await exists(current))) {
        if (creating) continue;
        throw Error("File not found");
      }
      if ((await lstat(current)).isSymbolicLink())
        throw Error("Symbolic links are not allowed");
    }
    if (await exists(result)) {
      const actual = await realpath(result);
      if (actual !== root && !actual.startsWith(root + "/"))
        throw Error("Path outside server data");
    }
    return result;
  }
  async parent(name: string, path: string, create = false) {
    pathSchema.parse(path);
    const root = join(await this.store.folder(name), "data");
    let handle = await secureOpen(root, root, true);
    try {
      for (const part of dirname(path)
        .split("/")
        .filter((x) => x && x !== ".")) {
        const next = "/proc/self/fd/" + handle.fd + "/" + part;
        if (create)
          await mkdir(next, { mode: 0o700 }).catch((e) => {
            if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
          });
        const opened = await secureOpen(root, next, true);
        await handle.close();
        handle = opened;
      }
      return handle;
    } catch (e) {
      await handle.close();
      throw e;
    }
  }
  async setBinary(name: string, path: string, temp: string) {
    const parent = await this.parent(name, path, true);
    const base = "/proc/self/fd/" + parent.fd;
    const stage =
      basename(path) +
      "." +
      (await import("node:crypto")).randomUUID() +
      ".upload";
    try {
      await copyFile(temp, base + "/" + stage, constants.COPYFILE_EXCL);
      await rename(base + "/" + stage, base + "/" + basename(path));
      return { uploaded: path };
    } finally {
      await parent.close();
    }
  }
  async list(name: string, path = "") {
    const dir = await this.path(name, path);
    if (!(await stat(dir)).isDirectory()) throw Error("Choose a directory");
    const handle = await secureOpen(
      join(this.store.root, name, "data"),
      dir,
      true,
    );
    const entries = [];
    try {
      for (const entry of await readdir("/proc/self/fd/" + handle.fd, {
        withFileTypes: true,
      })) {
        if (entry.isSymbolicLink() || secretPath(entry.name)) continue;
        const info = await lstat(
          "/proc/self/fd/" + handle.fd + "/" + entry.name,
        );
        if (info.isSymbolicLink()) continue;
        entries.push({
          name: entry.name,
          path: [path, entry.name].filter(Boolean).join("/"),
          type: entry.isDirectory()
            ? ("directory" as const)
            : ("file" as const),
          bytes: info.size,
          modifiedAt: info.mtime.toISOString(),
        });
      }
    } finally {
      await handle.close();
    }
    return {
      path,
      entries: entries.sort(
        (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
      ),
    };
  }
  async read(name: string, path: string) {
    if (path === "server.properties")
      return { path, text: (await this.properties.get(name)).raw };
    const file = await this.path(name, path);
    if (
      !textExtensions.has(extname(file)) ||
      /rcon|secret|credential|token|password|private.?key/i.test(basename(file))
    )
      throw Error("Only non-secret text configuration files can be viewed");
    const handle = await secureOpen(join(this.store.root, name, "data"), file);
    try {
      const root = join(this.store.root, name, "data");
      const actual = await realpath("/proc/self/fd/" + handle.fd);
      if (!actual.startsWith(root + "/"))
        throw Error("Path outside server data");
      if ((await handle.stat()).size > 512 * 1024)
        throw Error("Text file exceeds 512 KiB");
      return { path, text: await handle.readFile("utf8") };
    } finally {
      await handle.close();
    }
  }
  async write(name: string, path: string, text: string) {
    if (text.length > 512 * 1024) throw Error("Text exceeds 512 KiB");
    if (path === "server.properties")
      return this.properties.set(name, { raw: text, confirm: true });
    const file = await this.path(name, path, true);
    if (
      !textExtensions.has(extname(file)) ||
      /rcon|secret|credential|token|password|private.?key/i.test(basename(file))
    )
      throw Error("Only non-secret text configuration files can be edited");
    const parent = await this.parent(name, path, true);
    try {
      await atomicText(
        "/proc/self/fd/" + parent.fd + "/" + basename(file),
        text,
      );
    } finally {
      await parent.close();
    }
    return { path };
  }
  async remove(name: string, path: string) {
    if (
      !path ||
      ["world", "server.properties", "server-icon.png"].includes(path)
    )
      throw Error("Use the dedicated world/settings action for this path");
    const file = await this.path(name, path);
    const retained = join(
      await this.store.folder(name),
      "retained-files",
      randomUUID(),
    );
    await mkdir(dirname(retained), { recursive: true, mode: 0o700 });
    const parent = await secureOpen(
      join(this.store.root, name, "data"),
      dirname(file),
      true,
    );
    try {
      await rename(
        "/proc/self/fd/" + parent.fd + "/" + basename(file),
        retained,
      );
    } finally {
      await parent.close();
    }
    return { retained: true, path };
  }
  async upload(name: string, path: string, temp: string) {
    const target = await this.path(name, path, true);
    if (
      !path ||
      path === "server.properties" ||
      path.startsWith("world/") ||
      path === "world" ||
      /rcon|secret|credential|token|password|private.?key/i.test(basename(path))
    )
      throw Error("Use the dedicated world/properties action");

    if (await exists(target))
      throw Error("File already exists; use an explicit edit or delete action");
    const parent = await this.parent(name, path, true);
    try {
      await copyFile(
        temp,
        "/proc/self/fd/" + parent.fd + "/" + basename(target),
        constants.COPYFILE_EXCL,
      );
    } finally {
      await parent.close();
    }
    return { uploaded: path };
  }
  async logs(name: string) {
    const dir = join(await this.store.folder(name), "data/logs");
    if (!(await exists(dir))) return [];
    const listing = await this.list(name, "logs");
    return listing.entries
      .filter(
        (e) => e.type === "file" && /^[-a-zA-Z0-9_.]+\.(log|gz)$/.test(e.name),
      )
      .map((e) => ({ name: e.name, bytes: e.bytes, modifiedAt: e.modifiedAt }))
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  }
  async download(name: string, path: string) {
    if (path === "server.properties") {
      const text = (await this.properties.get(name)).raw;
      return { text, filename: "server.properties", type: "text/plain" };
    }
    const file = await this.path(name, path);
    if (
      !(await stat(file)).isFile() ||
      /rcon|secret|credential|token|password|private.?key/i.test(basename(file))
    )
      throw Error("File cannot be downloaded");
    const handle = await secureOpen(join(this.store.root, name, "data"), file);
    return {
      stream: handle.createReadStream(),
      filename: basename(file),
      type: "application/octet-stream",
    };
  }
}
