import { secretPath } from "./secrets";
import { secureOpen } from "./paths";
import { atomicText } from "./config";
import { constants, createWriteStream, openAsBlob } from "node:fs";
import { Readable, Writable } from "node:stream";
import { createGunzip } from "node:zlib";
import { BlobReader, ZipReader, ZipWriter, type FileEntry } from "@zip.js/zip.js";
import {
  lstat,
  readdir,
  realpath,
  mkdir,
  rename,
  stat,
  copyFile,
  rm,
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
const secretName = (name: string) =>
  /rcon|secret|credential|token|password|private.?key/i.test(name);
/** Paths whose layout only dedicated world/settings actions may change. */
export function protectedPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  return (
    !parts.length ||
    parts[0] === "world" ||
    (parts.length === 1 && ["server.properties", "server-icon.png"].includes(parts[0]))
  );
}
const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 20000;
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
          editable:
            entry.isFile() &&
            (entry.name === "server.properties" ||
              (textExtensions.has(extname(entry.name)) &&
                !secretName(entry.name) &&
                info.size <= 512 * 1024)),
          archive: entry.isFile() && extname(entry.name).toLowerCase() === ".zip",
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

  /** Opens `path`'s parent directory securely and returns it with the basename. */
  private async at(name: string, path: string, create = false) {
    const handle = await this.parent(name, path, create);
    return { handle, base: "/proc/self/fd/" + handle.fd + "/" + basename(path) };
  }
  async makeDirectory(name: string, path: string) {
    if (protectedPath(path)) throw Error("Use the World page for world folders");
    if (secretName(basename(path))) throw Error("Choose a different folder name");
    const parentPath = dirname(path) === "." ? "" : dirname(path);
    if (!(await stat(await this.path(name, parentPath))).isDirectory())
      throw Error("Parent folder not found");
    if (await exists(await this.path(name, path, true))) throw Error("A file or folder with that name already exists");
    const { handle, base } = await this.at(name, path);
    try {
      await mkdir(base, { mode: 0o700 });
    } finally {
      await handle.close();
    }
    return { path };
  }
  async renamePath(name: string, from: string, to: string) {
    if (protectedPath(from) || protectedPath(to))
      throw Error("Use the dedicated world/settings action for this path");
    if (to === from || to.startsWith(from + "/"))
      throw Error("Choose a different destination");
    await this.path(name, from);
    const target = await this.path(name, to, true);
    if (await exists(target)) throw Error("A file or folder with that name already exists");
    const source = await this.at(name, from);
    try {
      const destination = await this.at(name, to);
      try {
        const info = await lstat(source.base);
        if (info.isSymbolicLink()) throw Error("Symbolic links are not allowed");
        await rename(source.base, destination.base);
      } finally {
        await destination.handle.close();
      }
    } finally {
      await source.handle.close();
    }
    return { path: to };
  }
  /** Lists regular files under the given paths, skipping symlinks and secrets. */
  private async collect(name: string, paths: string[]) {
    const files: { path: string; entry: string; bytes: number }[] = [];
    let bytes = 0;
    const visit = async (path: string, entry: string) => {
      if (secretPath(path)) return;
      const full = await this.path(name, path);
      const info = await lstat(full);
      if (info.isSymbolicLink()) return;
      if (info.isDirectory()) {
        for (const child of await readdir(full)) await visit(path + "/" + child, entry + "/" + child);
      } else if (info.isFile()) {
        bytes += info.size;
        if (bytes > MAX_ARCHIVE_BYTES || files.length >= MAX_ARCHIVE_ENTRIES)
          throw Error("Selection is too large to compress (2 GiB or 20,000 files)");
        files.push({ path, entry, bytes: info.size });
      }
    };
    for (const path of paths) {
      pathSchema.parse(path);
      if (!path) throw Error("Choose files to compress");
      await visit(path, basename(path));
    }
    return { files, bytes };
  }
  async archive(name: string, paths: string[], destination: string) {
    if (!/\.zip$/i.test(destination)) throw Error("Archive name must end in .zip");
    if (protectedPath(destination) || secretName(basename(destination)))
      throw Error("Choose a destination outside the world folder");
    const target = await this.path(name, destination, true);
    if (await exists(target)) throw Error("A file with that name already exists");
    const { files, bytes } = await this.collect(name, [...new Set(paths)]);
    if (!files.length) throw Error("Nothing to compress");
    const { handle, base } = await this.at(name, destination);
    const temp = base + "." + randomUUID() + ".partial";
    try {
      const output = createWriteStream(temp, { flags: "wx", mode: 0o600 });
      const zip = new ZipWriter(Writable.toWeb(output) as WritableStream<Uint8Array>, { zip64: bytes > 3.5 * 1024 ** 3 });
      try {
        for (const file of files) {
          const source = await secureOpen(join(this.store.root, name, "data"), await this.path(name, file.path));
          try {
            await zip.add(file.entry, Readable.toWeb(source.createReadStream({ autoClose: false })) as ReadableStream<Uint8Array>);
          } finally {
            await source.close();
          }
        }
        await zip.close();
      } catch (e) {
        output.destroy();
        throw e;
      }
      if (await exists(base)) throw Error("A file with that name already exists");
      await rename(temp, base);
    } catch (e) {
      await rm(temp, { force: true }).catch(() => undefined);
      throw e;
    } finally {
      await handle.close();
    }
    return { path: destination, entries: files.length, bytes };
  }
  async extract(name: string, path: string, destination: string) {
    if (!/\.zip$/i.test(path)) throw Error("Only .zip archives can be extracted");
    if (destination && protectedPath(destination))
      throw Error("Use the World page to replace the world");
    const archive = await secureOpen(join(this.store.root, name, "data"), await this.path(name, path));
    const reader = new ZipReader(new BlobReader(await openAsBlob("/proc/self/fd/" + archive.fd)));
    try {
      const entries = await reader.getEntries();
      if (entries.length > MAX_ARCHIVE_ENTRIES) throw Error("Archive has too many entries");
      if (entries.reduce((n, e) => n + e.uncompressedSize, 0) > MAX_ARCHIVE_BYTES)
        throw Error("Archive expands beyond 2 GiB");
      const plan: { entry: (typeof entries)[number]; target: string }[] = [];
      for (const entry of entries) {
        const raw = entry.filename;
        const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
        if (
          !raw ||
          raw.startsWith("/") ||
          raw.includes("\\") ||
          raw.includes("\0") ||
          raw.split("/").includes("..") ||
          /^[a-zA-Z]:/.test(raw)
        )
          throw Error("Archive contains unsafe paths");
        if (mode === 0o120000) throw Error("Archive contains symbolic links");
        const relativePath = [destination, raw.replace(/\/+$/, "")].filter(Boolean).join("/");
        pathSchema.parse(relativePath);
        if (secretPath(relativePath)) throw Error("Archive contains secret-named files");
        if (protectedPath(relativePath)) throw Error("Archive would write into a protected path");
        if (entry.directory) continue;
        const target = await this.path(name, relativePath, true);
        if (await exists(target)) throw Error("Extraction would overwrite " + relativePath);
        plan.push({ entry, target: relativePath });
      }
      let written = 0;
      for (const { entry, target } of plan) {
        const { handle, base } = await this.at(name, target, true);
        try {
          const output = createWriteStream(base, { flags: "wx", mode: 0o600 });
          const sink = Writable.toWeb(output) as WritableStream<Uint8Array>;
          const counter = new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              written += chunk.length;
              if (written > MAX_ARCHIVE_BYTES) controller.error(Error("Archive expands beyond 2 GiB"));
              else controller.enqueue(chunk);
            },
          });
          const piping = counter.readable.pipeTo(sink);
          await (entry as FileEntry).getData(counter.writable);
          await piping;
        } finally {
          await handle.close();
        }
      }
      for (const entry of entries.filter((e) => e.directory)) {
        const dir = [destination, entry.filename.replace(/\/+$/, "")].filter(Boolean).join("/");
        // Opening a child's parent with create=true makes the folder chain.
        const { handle } = await this.at(name, dir + "/.keep", true);
        await handle.close();
      }
      return { destination, entries: plan.length };
    } finally {
      await reader.close();
      await archive.close();
    }
  }
  async readLog(name: string, file: string) {
    if (!/^[-a-zA-Z0-9_.]+\.(log|log\.gz)$/.test(file)) throw Error("Invalid log filename");
    const full = await this.path(name, "logs/" + file);
    const handle = await secureOpen(join(this.store.root, name, "data"), full);
    try {
      if ((await handle.stat()).size > 64 * 1024 * 1024) throw Error("Log file is too large to view; download it instead");
      const limit = 1024 * 1024;
      let tail = Buffer.alloc(0);
      let truncated = false;
      let stream: NodeJS.ReadableStream = handle.createReadStream({ autoClose: false });
      if (file.endsWith(".gz")) stream = stream.pipe(createGunzip());
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        tail = Buffer.concat([tail, chunk]);
        if (tail.length > limit) {
          truncated = true;
          tail = tail.subarray(tail.length - limit);
        }
      }
      let text = tail.toString("utf8");
      if (truncated) text = text.slice(text.indexOf("\n") + 1);
      // eslint-disable-next-line no-control-regex
      text = text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
      return { file, text, truncated };
    } finally {
      await handle.close();
    }
  }
}
