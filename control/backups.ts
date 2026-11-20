import { createArchive } from "./archive";
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
import { atomic, exists, nameSchema } from "./config";
import { Docker, command } from "./docker";
import type { BackupSnapshot } from "../src/domain";
export const targetsSchema = z
  .array(
    z
      .object({
        host: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]*$/),
        label: z.string().min(1).max(32).optional(),
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
export type RetentionSnapshot = {
  id: string;
  pinned?: boolean;
  reason?: string;
};
export function retentionCandidates(
  input: (string | RetentionSnapshot)[],
  now = Date.now(),
) {
  const snapshots = input
    .map((x) => (typeof x === "string" ? { id: x } : x))
    .filter((x) => snapshotPattern.test(x.id))
    .sort((a, b) => b.id.localeCompare(a.id));
  const regular = snapshots.filter((x) => !x.pinned),
    pinned = snapshots.filter((x) => x.pinned);
  const daily = new Map<string, string>(),
    weekly = new Map<string, string>(),
    monthly = new Map<string, string>();
  for (const s of regular) {
    const day = s.id.slice(0, 8);
    const date = new Date(
      day.slice(0, 4) +
        "-" +
        day.slice(4, 6) +
        "-" +
        day.slice(6, 8) +
        "T00:00:00Z",
    );
    if (!daily.has(day)) daily.set(day, s.id);
    const week = isoWeek(date);
    if (!weekly.has(week)) weekly.set(week, s.id);
    const month = day.slice(0, 6);
    if (!monthly.has(month)) monthly.set(month, s.id);
  }
  const keep = new Set(
    [...daily.values()]
      .slice(0, 14)
      .concat(
        [...weekly.values()].slice(0, 8),
        [...monthly.values()].slice(0, 12),
      ),
  );
  for (const [i, s] of pinned.entries()) {
    const day = s.id.slice(0, 8);
    const age =
      now -
      Date.parse(
        day.slice(0, 4) +
          "-" +
          day.slice(4, 6) +
          "-" +
          day.slice(6, 8) +
          "T00:00:00Z",
      );
    if (i < 3 || age < 90 * 86400000) keep.add(s.id);
  }
  return snapshots.map((s) => s.id).filter((id) => !keep.has(id));
}
export class Backups {
  constructor(
    readonly root: string,
    readonly docker: Docker,
    readonly targets: BackupTarget[],
  ) {}
  async list(name: string): Promise<BackupSnapshot[]> {
    await this.docker.store.folder(name);
    const aliasFile = join(
      await this.docker.store.folder(name),
      "backup-aliases.json",
    );
    const aliases: string[] = (await exists(aliasFile))
      ? JSON.parse(await readFile(aliasFile, "utf8"))
      : [];
    const snapshots: BackupSnapshot[] = [];
    for (const sourceName of [...new Set([name, ...aliases])]) {
      nameSchema.parse(sourceName);
      const base = join(this.root, sourceName);
      if (!(await exists(base))) continue;
      for (const id of (await readdir(base))
        .filter((id) => snapshotPattern.test(id))
        .sort()
        .reverse()) {
        const path = join(base, id);
        if (!(await exists(join(path, "COMPLETE")))) continue;
        const info = await stat(join(path, "world.tar.gz"));
        snapshots.push({
          id,
          sourceName,
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
          locations: this.targets.map((t) => t.label ?? t.host),
          ...((await exists(join(path, "snapshot.json")))
            ? JSON.parse(await readFile(join(path, "snapshot.json"), "utf8"))
            : {}),
        });
      }
    }
    return snapshots.sort((a, b) => b.id.localeCompare(a.id));
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
      "; chmod 700 " +
      quote(remote) +
      " " +
      quote(incoming) +
      "; tar -C " +
      quote(incoming) +
      " -xf -; cd " +
      quote(incoming) +
      "; find . -type d -print0 | xargs -0 chmod 700; find . -type f -print0 | xargs -0 chmod 600; sha256sum -c --status SHA256SUMS; cd ..; mv " +
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
  async backup(name: string, reason = "daily") {
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
      const secret = (await readFile(join(dir, "rcon.secret"), "utf8")).trim();
      await createArchive(dir, archive, secret);
    } finally {
      if (live) await this.docker.rcon(name, "save-on");
    }
    await writeFile(
      join(stage, "SHA256SUMS"),
      (await hash(archive)) + "  world.tar.gz\n",
      { mode: 0o600 },
    );
    await writeFile(join(stage, "COMPLETE"), "", { mode: 0o600 });
    await atomic(join(stage, "snapshot.json"), {
      reason,
      pinned: reason !== "daily" && reason !== "manual",
      createdAt: new Date().toISOString(),
    });
    const dest = join(base, id);
    await rename(stage, dest);
    const statePath = join(dir, "backup-location-state.json");
    const locationState: Record<
      string,
      { lastAttempt: number; success: boolean; lastSuccess: number }
    > = (await exists(statePath))
      ? JSON.parse(await readFile(statePath, "utf8"))
      : {};
    for (const target of this.targets) {
      const previous = locationState[target.host];
      locationState[target.host] = {
        lastAttempt: Date.now() / 1000,
        success: false,
        lastSuccess: previous?.lastSuccess ?? 0,
      };
      await atomic(statePath, locationState);
      await this.replicate(dest, name, id, target);
      locationState[target.host] = {
        lastAttempt: Date.now() / 1000,
        success: true,
        lastSuccess: Date.now() / 1000,
      };
      await atomic(statePath, locationState);
    }
    await atomic(join(dest, "replicated.json"), {
      targets: this.targets.length,
      at: new Date().toISOString(),
    });
    await atomic(join(dir, "backup-success.json"), {
      at: id,
      targets: this.targets.length,
    });
    for (const old of retentionCandidates(await this.list(name))) {
      for (const target of this.targets) {
        const sourceName =
          (await this.list(name)).find((s) => s.id === old)?.sourceName ?? name;
        const remote = target.path + "/" + sourceName + "/" + old;
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
      const sourceName =
        (await this.list(name)).find((s) => s.id === old)?.sourceName ?? name;
      await rm(join(this.root, sourceName, old), { recursive: true });
    }
    return { snapshot: id, replicated: true as const };
  }
  async pin(name: string, snapshot: string, pinned: boolean) {
    if (!snapshotPattern.test(snapshot)) throw Error("Invalid snapshot");
    const item = (await this.list(name)).find(item => item.id === snapshot);
    if (!item) throw Error("Backup not found");
    const file = join(this.root, item.sourceName ?? name, snapshot, "snapshot.json");
    const metadata = await exists(file) ? JSON.parse(await readFile(file, "utf8")) : {};
    await atomic(file, {...metadata, pinned});
    return {snapshot, pinned};
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
