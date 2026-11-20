import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { randomBytes, createHash } from "node:crypto";
import { join, basename } from "node:path";
import type { ServerConfig } from "../src/domain";
import { ConfigStore, atomic, exists } from "./config";
import { Upstream } from "./upstream";
const execute = promisify(execFile);
export async function command(args: string[], timeout = 180000) {
  try {
    const r = await execute(args[0], args.slice(1), {
      timeout,
      maxBuffer: 8 * 1024 * 1024,
    });
    return r.stdout;
  } catch {
    throw Error("Operation failed; inspect private service diagnostics");
  }
}
type Container = {
  Id: string;
  Config: { Labels: Record<string, string> };
  Mounts: { Destination: string; Source: string }[];
  State: { Running: boolean; Status: string; StartedAt?: string };
};
export class Docker {
  constructor(
    readonly store: ConfigStore,
    readonly upstream: Upstream,
    readonly cpus: number,
    readonly run = command,
  ) {}
  async rootless() {
    const options: string[] = JSON.parse(
      await this.run([
        "docker",
        "info",
        "--format",
        "{{json .SecurityOptions}}",
      ]),
    );
    if (!options.some((x) => x.includes("rootless")))
      throw Error("Rootless Docker is required");
  }
  async container(
    name: string,
    optional = false,
  ): Promise<Container | undefined> {
    const ids = (
      await this.run([
        "docker",
        "ps",
        "-aq",
        "--filter",
        "label=io.mc.managed=true",
        "--filter",
        "label=io.mc.name=" + name,
      ])
    )
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!ids.length && optional) return;
    if (ids.length !== 1) throw Error("Expected exactly one managed container");
    const info: Container = JSON.parse(
      await this.run(["docker", "inspect", ids[0]]),
    )[0];
    if (
      info.Config.Labels["io.mc.managed"] !== "true" ||
      info.Config.Labels["io.mc.name"] !== name
    )
      throw Error("Container is not managed");
    if (
      !info.Mounts.some(
        (m) =>
          m.Destination === "/data" &&
          m.Source === join(this.store.root, name, "data"),
      )
    )
      throw Error("Container storage mismatch");
    return info;
  }
  async id(name: string) {
    const info = await this.container(name);
    if (!info) throw Error("Container absent");
    return info.Id;
  }
  async rcon(name: string, value: string) {
    if (!value || value.length > 1024 || /[\r\n]/.test(value))
      throw Error("Invalid console command");
    return this.run(
      ["docker", "exec", await this.id(name), "rcon-cli", value],
      60000,
    );
  }
  async logs(name: string) {
    const id = await this.id(name);
    const r = await execute("docker", ["logs", "--tail", "200", id], {
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return r.stdout + r.stderr;
  }
  async lifecycle(verb: "start" | "stop" | "restart", name: string) {
    await this.run([
      "docker",
      verb,
      ...(verb === "start" ? [] : ["--time", "120"]),
      await this.id(name),
    ]);
  }
  async kill(name: string) {
    await this.run(["docker", "kill", await this.id(name)]);
  }
  async metrics(name: string, limit: number) {
    const info = await this.container(name, true);
    const empty = {
      uptimeSeconds: null,
      cpuPercent: null,
      memoryBytes: null,
      memoryLimitBytes: limit * 1024 * 1024,
      tps: null,
      mspt: null,
      cpuLimit: this.cpus,
    };
    if (!info?.State.Running) return empty;
    const stats: Record<string, string> = JSON.parse(
      await this.run(
        ["docker", "stats", "--no-stream", "--format", "{{json .}}", info.Id],
        15000,
      ),
    );
    const bytes = (value: string) => {
      const m = value.trim().match(/^([0-9.]+)\s*([KMGT]?i?B)$/i);
      if (!m) return null;
      const unit = m[2].toLowerCase();
      const exponent = ["b", "kib", "mib", "gib", "tib"].indexOf(unit);
      return (
        Number(m[1]) *
        (exponent >= 0
          ? 1024 ** exponent
          : 1000 ** ["b", "kb", "mb", "gb", "tb"].indexOf(unit))
      );
    };
    let tps: number | null = null,
      mspt: number | null = null;
    try {
      const tick = await this.rcon(name, "tick query");
      const t = tick.match(/([0-9.]+)\s*(?:ticks per second|TPS)/i);
      const m = tick.match(/([0-9.]+)\s*(?:milliseconds|ms)/i);
      if (t) tps = Number(t[1]);
      if (m) mspt = Number(m[1]);
    } catch {
      /* Optional vanilla tick telemetry may not be supported. */
    }
    return {
      ...empty,
      uptimeSeconds: info.State.StartedAt
        ? Math.max(
            0,
            Math.floor((Date.now() - Date.parse(info.State.StartedAt)) / 1000),
          )
        : null,
      cpuPercent: Number(stats.CPUPerc?.replace("%", "")) || 0,
      memoryBytes: bytes(stats.MemUsage?.split("/")[0] || ""),
      tps,
      mspt,
    };
  }
  async compose(c: ServerConfig) {
    const dir = await this.store.folder(c.name);
    const secret = join(dir, "rcon.secret");
    if (!(await exists(secret)))
      await writeFile(secret, randomBytes(32).toString("hex"), { mode: 0o600 });
    const env: Record<string, string> = {
      UID: "0",
      GID: "0",
      EULA: "TRUE",
      TYPE: "FABRIC",
      VERSION: c.version,
      MEMORY: c.memory + "M",
      INIT_MEMORY: "512M",
      USE_AIKAR_FLAGS: "TRUE",
      OVERRIDE_SERVER_PROPERTIES: "FALSE",
      REMOVE_OLD_MODS: "TRUE",
      ENABLE_RCON: "TRUE",
      RCON_PASSWORD_FILE: "/run/secrets/rcon",
      RCON_PORT: "25575",
      ONLINE_MODE: "TRUE",
      MODRINTH_PROJECTS: c.mods.join(","),
      MODRINTH_DOWNLOAD_DEPENDENCIES: "required",
      MODRINTH_ALLOWED_VERSION_TYPE: "alpha",
      LEVEL: "world",
      MAX_PLAYERS: "20",
      VIEW_DISTANCE: "10",
      ENABLE_ROLLING_LOGS: "true",
    };
    if (c.fabricLoader) env.FABRIC_LOADER_VERSION = c.fabricLoader;
    const urls: string[] = [],
      managed: Record<string, string> = {};
    for (const project of c.datapacks) {
      const build = (
        await this.upstream.builds(project, c.version, "datapack")
      )[0];
      if (!build) throw Error("No compatible datapack build");
      const file = build.files.find((f) => f.primary) || build.files[0];
      if (basename(file.filename) !== file.filename)
        throw Error("Unsafe datapack filename");
      urls.push(file.url);
      managed[file.filename] = file.hashes.sha512;
    }
    const manifest = join(dir, "managed-datapacks.json");
    const previous: Record<string, string> = (await exists(manifest))
      ? JSON.parse(await readFile(manifest, "utf8"))
      : {};
    for (const [filename, digest] of Object.entries(previous)) {
      if (basename(filename) !== filename)
        throw Error("Invalid ownership manifest");
      const file = join(dir, "data/world/datapacks", filename);
      if (managed[filename] !== digest && (await exists(file))) {
        if (
          createHash("sha512")
            .update(await readFile(file))
            .digest("hex") !== digest
        )
          throw Error(
            "Managed datapack changed locally; operator review required",
          );
        await unlink(file);
      }
    }
    for (const filename of Object.keys(managed)) {
      if (
        (await exists(join(dir, "data/world/datapacks", filename))) &&
        !previous[filename]
      )
        throw Error("Datapack conflicts with an unmanaged file");
    }
    await atomic(manifest, managed);
    if (urls.length) env.DATAPACKS = urls.join(",");
    await atomic(join(dir, "compose.json"), {
      name: "mc-" + c.name,
      services: {
        server: {
          image: "itzg/minecraft-server:" + c.javaTag,
          labels: { "io.mc.managed": "true", "io.mc.name": c.name },
          restart: "unless-stopped",
          mem_limit: c.memory + 512 + "m",
          memswap_limit: c.memory + 512 + "m",
          cpus: this.cpus,
          pids_limit: 512,
          ports: [`0.0.0.0:${c.port}:25565/tcp`],
          environment: env,
          volumes: [
            join(dir, "data") + ":/data",
            secret + ":/run/secrets/rcon:ro",
          ],
          networks: ["game"],
          logging: {
            driver: "json-file",
            options: { "max-size": "10m", "max-file": "3" },
          },
          stop_grace_period: "120s",
        },
      },
      networks: { game: {} },
    });
  }
  async recreate(c: ServerConfig) {
    const old = await this.container(c.name, true);
    if (old?.State.Running)
      await this.run(["docker", "stop", "--time", "120", old.Id]);
    await mkdir(join(await this.store.folder(c.name), "data"), {
      recursive: true,
      mode: 0o700,
    });
    await this.compose(c);
    await this.run(
      [
        "docker",
        "compose",
        "-f",
        join(await this.store.folder(c.name), "compose.json"),
        "up",
        "-d",
        "--pull",
        "always",
      ],
      900000,
    );
  }
}
