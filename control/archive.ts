import { secretPath } from "./secrets";
import { secureOpen } from "./paths";
import tarStream from "tar-stream";
import { createReadStream, createWriteStream } from "node:fs";
import { readdir, lstat, rename, chmod } from "node:fs/promises";
import { join } from "node:path";
import { createGzip, createGunzip } from "node:zlib";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { exists } from "./config";
const excluded = secretPath;
class Redactor extends Transform {
  private tail = Buffer.alloc(0);
  private readonly secret: Buffer;
  private readonly replacement: Buffer;
  constructor(secret: string) {
    super();
    this.secret = Buffer.from(secret);
    this.replacement = Buffer.from("*".repeat(this.secret.length));
  }
  private redact(data: Buffer) {
    if (!this.secret.length) return data;
    let at = 0;
    while ((at = data.indexOf(this.secret, at)) >= 0) {
      this.replacement.copy(data, at);
      at += this.secret.length;
    }
    return data;
  }
  _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (e?: Error | null, data?: Buffer) => void,
  ) {
    const data = this.redact(Buffer.concat([this.tail, chunk]));
    const keep = Math.min(Math.max(0, this.secret.length - 1), data.length);
    this.tail = Buffer.from(data.subarray(data.length - keep));
    callback(null, data.subarray(0, data.length - keep));
  }
  _flush(callback: (e?: Error | null, data?: Buffer) => void) {
    callback(null, this.redact(this.tail));
  }
}
export async function createArchive(
  root: string,
  path: string,
  secret: string,
) {
  const pack = tarStream.pack();
  const output = pipeline(
    pack,
    createGzip({ level: 1 }),
    createWriteStream(path, { mode: 0o600 }),
  );
  async function add(relative: string) {
    if (excluded(relative)) return;
    const file = join(root, relative);
    if (!(await exists(file))) return;
    const info = await lstat(file);
    if (info.isSymbolicLink())
      throw Error("Backup source contains a symbolic link");
    if (info.isDirectory()) {
      await new Promise<void>((resolve, reject) =>
        pack.entry(
          { name: relative + "/", type: "directory", mode: 0o700 },
          (e) => (e ? reject(e) : resolve()),
        ),
      );
      const directory = await secureOpen(
        relative === "data" || relative.startsWith("data/")
          ? join(root, "data")
          : root,
        file,
        true,
      );
      let names: string[];
      try {
        names = await readdir("/proc/self/fd/" + directory.fd);
      } finally {
        await directory.close();
      }
      for (const name of names) await add(relative + "/" + name);
    } else if (info.isFile()) {
      const handle = await secureOpen(
        relative.startsWith("data/") ? join(root, "data") : root,
        file,
      );
      const entry = pack.entry({
        name: relative,
        type: "file",
        size: info.size,
        mode: 0o600,
        mtime: info.mtime,
      });
      await pipeline(handle.createReadStream(), new Redactor(secret), entry);
    }
  }
  try {
    for (const name of [
      "data",
      "config.json",
      "compose.json",
      "managed-datapacks.json",
      "schedule.json",
      "backup-aliases.json",
    ])
      await add(name);
    pack.finalize();
    await output;
    await chmod(path, 0o600);
  } catch (e) {
    pack.destroy(e instanceof Error ? e : Error("Archive failed"));
    await output.catch(() => undefined);
    throw e;
  }
}
export async function sanitizeArchive(path: string, secret: string) {
  const destination = path + ".sanitized";
  const pack = tarStream.pack(),
    extract = tarStream.extract();
  const output = pipeline(
    pack,
    createGzip({ level: 1 }),
    createWriteStream(destination, { mode: 0o600 }),
  );
  extract.on("entry", (header, stream, next) => {
    const work = async () => {
      if (
        header.name.startsWith("/") ||
        header.name.split("/").includes("..") ||
        !["file", "directory"].includes(header.type ?? "file")
      )
        throw Error("Unsafe archive");
      if (excluded(header.name.replace(/^\.\//, ""))) {
        stream.resume();
        await new Promise<void>((r, j) => {
          stream.once("end", r);
          stream.once("error", j);
        });
        return;
      }
      const entry = pack.entry({
        ...header,
        mode: header.type === "directory" ? 0o700 : 0o600,
      });
      await pipeline(stream, new Redactor(secret), entry);
    };
    work().then(
      () => next(),
      (e) => extract.destroy(e),
    );
  });
  try {
    await pipeline(createReadStream(path), createGunzip(), extract);
    pack.finalize();
    await output;
    await chmod(destination, 0o600);
    await rename(destination, path);
  } catch (e) {
    pack.destroy(e instanceof Error ? e : Error("Archive failed"));
    await output.catch(() => undefined);
    throw e;
  }
}
