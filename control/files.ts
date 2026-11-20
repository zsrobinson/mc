import { constants } from "node:fs";
import {
  lstat,
  readdir,
  realpath,
  open,
  writeFile,
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
  async list(name: string, path = "") {
    const dir = await this.path(name, path);
    if (!(await stat(dir)).isDirectory()) throw Error("Choose a directory");
    const entries = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const info = await lstat(join(dir, entry.name));
      entries.push({
        name: entry.name,
        path: [path, entry.name].filter(Boolean).join("/"),
        type: entry.isDirectory() ? ("directory" as const) : ("file" as const),
        bytes: info.size,
        modifiedAt: info.mtime.toISOString(),
      });
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
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
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
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(file, text, {
      mode: 0o600,
      flag: (await exists(file)) ? "w" : "wx",
    });
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
    await rename(file, retained);
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
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    if (await exists(target))
      throw Error("File already exists; use an explicit edit or delete action");
    await copyFile(temp, target, constants.COPYFILE_EXCL);
    return { uploaded: path };
  }
  async logs(name: string) {
    const dir = join(await this.store.folder(name), "data/logs");
    if (!(await exists(dir))) return [];
    const result = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !/^[-a-zA-Z0-9_.]+\.(log|gz)$/.test(entry.name))
        continue;
      const info = await stat(join(dir, entry.name));
      result.push({
        name: entry.name,
        bytes: info.size,
        modifiedAt: info.mtime.toISOString(),
      });
    }
    return result.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
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
    return { file, filename: basename(file), type: "application/octet-stream" };
  }
}
