import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { atomic, exists } from "./config";
import { Docker, command } from "./docker";
import type { BackupSnapshot } from "../src/domain";
export const targetsSchema = z
  .array(
    z
      .object({
        host: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]*$/),
        path: z
          .string()
          .min(1)
          .refine(
            (p) => !p.split("/").includes("..") && !/[\r\n\0]/.test(p),
            "Invalid backup path",
          ),
      })
      .strict(),
  )
  .min(2);
export type BackupTarget = z.infer<typeof targetsSchema>[number];
const snapshotPattern = /^\d{8}T\d{6}Z-[a-f0-9]{6}$/;
const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
function stamp(date = new Date()) {
  return date
    .toISOString()
    .replaceAll(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z");
}
async function hash(path: string) {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest("hex");
}
function completed(child: ReturnType<typeof spawn>) {
  return new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(Error("Backup transfer failed")),
    );
  });
}
function isoWeek(date: Date) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const y = d.getUTCFullYear();
  return (
    y + "-" + Math.ceil(((d.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7)
  );
}
export function retentionCandidates(ids: string[]) {
  const sorted = ids
    .filter((id) => snapshotPattern.test(id))
    .sort()
    .reverse();
  const weeks = new Map<string, string>();
  for (const id of sorted) {
    const d = new Date(
      id.slice(0, 4) +
        "-" +
        id.slice(4, 6) +
        "-" +
        id.slice(6, 8) +
        "T" +
        id.slice(9, 11) +
        ":" +
        id.slice(11, 13) +
        ":" +
        id.slice(13, 15) +
        "Z",
    );
    const week = isoWeek(d);
    if (!weeks.has(week)) weeks.set(week, id);
  }
  const keep = new Set([
    ...sorted.slice(0, 14),
    ...[...weeks.values()].slice(0, 8),
  ]);
  return sorted.filter((id) => !keep.has(id));
}
export class Backups {
  constructor(
    readonly root: string,
    readonly docker: Docker,
    readonly targets: BackupTarget[],
  ) {}
  async list(name: string): Promise<BackupSnapshot[]> {
    await this.docker.store.folder(name);
    const base = join(this.root, name);
    if (!(await exists(base))) return [];
    const snapshots: BackupSnapshot[] = [];
    for (const id of (await readdir(base))
      .filter((id) => snapshotPattern.test(id))
      .sort()
      .reverse()) {
      const path = join(base, id);
      if (!(await exists(join(path, "COMPLETE")))) continue;
      const info = await stat(join(path, "world.tar.gz"));
      snapshots.push({
        id,
        createdAt:
          id.slice(0, 4) +
          "-" +
          id.slice(4, 6) +
          "-" +
          id.slice(6, 8) +
          "T" +
          id.slice(9, 11) +
          ":" +
          id.slice(11, 13) +
          ":" +
          id.slice(13, 15) +
          "Z",
        bytes: info.size,
        replicated: await exists(join(path, "replicated.json")),
      });
    }
    return snapshots;
  }
  async replicate(
    path: string,
    name: string,
    id: string,
    target: BackupTarget,
  ) {
    const remote = target.path + "/" + name;
    const incoming = remote + "/.incoming-" + id;
    const script =
      "set -eu; umask 077; mkdir -p " +
      quote(incoming) +
      "; tar -C " +
      quote(incoming) +
      " -xf -; cd " +
      quote(incoming) +
      "; sha256sum -c --status SHA256SUMS; cd ..; mv " +
      quote(".incoming-" + id) +
      " " +
      quote(id);
    const tar = spawn("tar", ["-C", path, "-cf", "-", "."], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    const ssh = spawn(
      "ssh",
      ["-o", "BatchMode=yes", "-o", "ConnectTimeout=15", target.host, script],
      { stdio: ["pipe", "ignore", "ignore"] },
    );
    try {
      await Promise.all([
        completed(tar),
        completed(ssh),
        pipeline(tar.stdout!, ssh.stdin!),
      ]);
    } catch {
      tar.kill();
      ssh.kill();
      throw Error("Backup replication failed; local snapshot retained");
    }
  }
  async backup(name: string) {
    const dir = await this.docker.store.folder(name);
    const base = join(this.root, name);
    await mkdir(base, { recursive: true, mode: 0o700 });
    const id = stamp() + "-" + randomBytes(3).toString("hex");
    const stage = join(base, id + ".partial");
    await mkdir(stage, { mode: 0o700 });
    const info = await this.docker.container(name, true);
    const live = info?.State.Running;
    const archive = join(stage, "world.tar.gz");
    try {
      if (live) {
        await this.docker.rcon(name, "save-off");
        await this.docker.rcon(name, "save-all flush");
      }
      const parts = [
        "data",
        "config.json",
        "compose.json",
        "rcon.secret",
        "managed-datapacks.json",
      ];
      const present: string[] = [];
      for (const part of parts)
        if (await exists(join(dir, part))) present.push(part);
      await command(["tar", "-C", dir, "-czf", archive, ...present], 900000);
    } finally {
      if (live) await this.docker.rcon(name, "save-on");
    }
    await writeFile(
      join(stage, "SHA256SUMS"),
      (await hash(archive)) + "  world.tar.gz\n",
      { mode: 0o600 },
    );
    await writeFile(join(stage, "COMPLETE"), "");
    const dest = join(base, id);
    await rename(stage, dest);
    for (const target of this.targets)
      await this.replicate(dest, name, id, target);
    await atomic(join(dest, "replicated.json"), {
      targets: this.targets.length,
      at: new Date().toISOString(),
    });
    await atomic(join(dir, "backup-success.json"), {
      at: id,
      targets: this.targets.length,
    });
    for (const old of retentionCandidates(
      (await this.list(name)).map((s) => s.id),
    )) {
      for (const target of this.targets) {
        const remote = target.path + "/" + name + "/" + old;
        await command(
          [
            "ssh",
            "-o",
            "BatchMode=yes",
            target.host,
            "test -f " +
              quote(remote + "/COMPLETE") +
              " && rm -r -- " +
              quote(remote),
          ],
          60000,
        );
      }
      await rm(join(base, old), { recursive: true });
    }
    return { snapshot: id, replicated: true as const };
  }
  async latest(name: string) {
    const path = join(
      await this.docker.store.folder(name),
      "backup-success.json",
    );
    return (await exists(path))
      ? (JSON.parse(await readFile(path, "utf8")) as {
          at: string;
          targets: number;
        })
      : undefined;
  }
}
