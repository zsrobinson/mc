import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { Docker } from "./docker";
import { Properties, serializeProperties } from "./properties";
import { exists } from "./config";
import { Upstream } from "./upstream";
const playerName = z.string().regex(/^[A-Za-z0-9_]{1,16}$/);
const actions = z.enum([
  "kick",
  "whitelist-add",
  "whitelist-remove",
  "whitelist-on",
  "whitelist-off",
  "op",
  "deop",
  "ban",
  "pardon",
  "ban-ip",
  "pardon-ip",
]);
type Player = {
  name?: string;
  uuid?: string;
  level?: number;
  reason?: string;
  ip?: string;
};
export class Players {
  constructor(
    readonly docker: Docker,
    readonly properties: Properties,
    readonly upstream: Upstream,
  ) {}
  async json(name: string, file: string): Promise<Player[]> {
    const path = join(await this.docker.store.folder(name), "data", file);
    return (await exists(path)) ? JSON.parse(await readFile(path, "utf8")) : [];
  }
  async list(name: string) {
    const info = await this.docker.container(name, true);
    let online: string[] = [];
    if (info?.State.Running) {
      const text = await this.docker.rcon(name, "list");
      online = text
        .split(":")
        .slice(1)
        .join(":")
        .trim()
        .split(/,\s*/)
        .filter(Boolean);
    }
    const { values } = await this.properties.internal(name);
    return {
      online,
      whitelistEnabled: values["white-list"] === "true",
      whitelist: await this.json(name, "whitelist.json"),
      ops: await this.json(name, "ops.json"),
      bannedPlayers: await this.json(name, "banned-players.json"),
      bannedIps: await this.json(name, "banned-ips.json"),
    };
  }
  async action(name: string, payload: unknown) {
    const input = z
      .object({
        action: actions,
        player: z.string().optional(),
        reason: z
          .string()
          .max(160)
          .regex(/^[^\r\n]*$/)
          .optional(),
      })
      .strict()
      .parse(payload);
    const toggle =
      input.action === "whitelist-on" || input.action === "whitelist-off";
    const isIp = input.action === "ban-ip" || input.action === "pardon-ip";
    if (!toggle) {
      if (isIp) z.union([z.ipv4(), z.ipv6()]).parse(input.player);
      else playerName.parse(input.player);
    }
    const info = await this.docker.container(name, true);
    const commands: Record<string, string> = {
      "whitelist-add": "whitelist add",
      "whitelist-remove": "whitelist remove",
      "whitelist-on": "whitelist on",
      "whitelist-off": "whitelist off",
      kick: "kick",
      op: "op",
      deop: "deop",
      ban: "ban",
      pardon: "pardon",
      "ban-ip": "ban-ip",
      "pardon-ip": "pardon-ip",
    };
    if (info?.State.Running) {
      const text = await this.docker.rcon(
        name,
        commands[input.action] +
          (input.player ? " " + input.player : "") +
          (input.reason && ["kick", "ban", "ban-ip"].includes(input.action)
            ? " " + input.reason
            : ""),
      );
      return { text, ...(await this.list(name)) };
    }
    if (input.action === "kick") throw Error("Server is stopped");
    if (toggle) {
      const { path, values } = await this.properties.internal(name);
      values["white-list"] = String(input.action === "whitelist-on");
      await writeFile(path, serializeProperties(values), { mode: 0o600 });
      return this.list(name);
    }
    const files: Record<string, string> = {
      "whitelist-add": "whitelist.json",
      "whitelist-remove": "whitelist.json",
      op: "ops.json",
      deop: "ops.json",
      ban: "banned-players.json",
      pardon: "banned-players.json",
      "ban-ip": "banned-ips.json",
      "pardon-ip": "banned-ips.json",
    };
    const file = files[input.action];
    let entries = await this.json(name, file);
    const player = input.player!;
    entries = entries.filter((e) =>
      isIp ? e.ip !== player : e.name?.toLowerCase() !== player.toLowerCase(),
    );
    if (["whitelist-add", "op", "ban", "ban-ip"].includes(input.action)) {
      const time = new Date()
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d+Z$/, " +0000");
      if (isIp)
        entries.push({
          ip: player,
          reason: input.reason || "Banned by operator",
          created: time,
          source: "Server",
          expires: "forever",
        } as Player);
      else {
        const profile = await this.upstream.json<{ id: string; name: string }>(
          "https://api.mojang.com/users/profiles/minecraft/" +
            encodeURIComponent(player),
        );
        if (!/^[a-f0-9]{32}$/i.test(profile.id))
          throw Error("Player UUID lookup failed");
        const uuid = profile.id.replace(
          /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
          "$1-$2-$3-$4-$5",
        );
        entries.push({
          uuid,
          name: profile.name,
          ...(input.action === "op"
            ? { level: 4, bypassesPlayerLimit: false }
            : {}),
          ...(input.action === "ban"
            ? {
                created: time,
                source: "Server",
                expires: "forever",
                reason: input.reason || "Banned by operator",
              }
            : {}),
        });
      }
    }
    const path = join(await this.docker.store.folder(name), "data", file);
    await writeFile(path, JSON.stringify(entries, null, 2) + "\n", {
      mode: 0o600,
    });
    return this.list(name);
  }
}
