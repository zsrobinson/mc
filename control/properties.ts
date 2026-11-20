import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ConfigStore } from "./config";
const protectedKeys = new Set([
  "rcon.password",
  "rcon.port",
  "enable-rcon",
  "server-port",
  "server-ip",
  "level-name",
  "enable-query",
  "query.port",
  "management-server-enabled",
]);
const decode = (s: string) =>
  s.replace(/\\u([0-9a-f]{4})|\\(.)/gi, (_m, hex: string, char: string) =>
    hex
      ? String.fromCharCode(parseInt(hex, 16))
      : ({ n: "\n", r: "\r", t: "\t", f: "\f" }[char] ?? char),
  );
const encode = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
export function parseProperties(raw: string) {
  const values: Record<string, string> = {};
  const lines = raw.replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    while (/(?<!\\)(?:\\\\)*\\$/.test(line) && i + 1 < lines.length)
      line = line.slice(0, -1) + lines[++i].trimStart();
    if (!line.trim() || /^[ \t]*[#!]/.test(line)) continue;
    const match = line
      .trimStart()
      .match(/^((?:\\.|[^:=\s])+)[ \t]*[=:]?[ \t]*(.*)$/);
    if (match) values[decode(match[1])] = decode(match[2]);
  }
  return values;
}
export function serializeProperties(values: Record<string, string>) {
  return (
    Object.entries(values)
      .map(
        ([key, value]) =>
          encode(key).replace(/[ =:]/g, "\\$&") + "=" + encode(value),
      )
      .join("\n") + "\n"
  );
}
const bool = z
  .union([z.boolean(), z.enum(["true", "false"])])
  .transform(String);
const integer = (min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).transform(String);
const friendly = z
  .object({
    motd: z.string().max(512),
    difficulty: z.enum(["peaceful", "easy", "normal", "hard"]),
    gamemode: z.enum(["survival", "creative", "adventure", "spectator"]),
    hardcore: bool,
    pvp: bool,
    "max-players": integer(1, 100),
    "view-distance": integer(2, 32),
    "simulation-distance": integer(2, 32),
    "spawn-protection": integer(0, 64),
    "allow-flight": bool,
    "enable-command-block": bool,
    "online-mode": bool,
  })
  .partial()
  .strict();
export class Properties {
  constructor(readonly store: ConfigStore) {}
  async internal(name: string) {
    const path = join(await this.store.folder(name), "data/server.properties");
    return { path, values: parseProperties(await readFile(path, "utf8")) };
  }
  async get(name: string) {
    const { values } = await this.internal(name);
    const safe = { ...values };
    for (const key of protectedKeys)
      if (key.toLowerCase().includes("password")) safe[key] = "<redacted>";
    return {
      values: Object.fromEntries(
        Object.entries(safe).filter(([key]) => !protectedKeys.has(key)),
      ),
      raw: serializeProperties(safe),
    };
  }
  async set(name: string, payload: unknown) {
    const input = z
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
    if ((input.values === undefined) === (input.raw === undefined))
      throw Error("Supply values or raw properties");
    const { path, values } = await this.internal(name);
    let next: Record<string, string>;
    if (input.values) next = { ...values, ...friendly.parse(input.values) };
    else {
      next = parseProperties(input.raw!);
      for (const key of protectedKeys) {
        if (
          next[key] !== undefined &&
          next[key] !== values[key] &&
          next[key] !== "<redacted>"
        )
          throw Error("Network and RCON properties are managed by the helper");
        if (values[key] !== undefined) next[key] = values[key];
      }
    }
    Object.assign(next, {
      "server-port": "25565",
      "server-ip": "",
      "enable-rcon": "true",
      "rcon.port": "25575",
      "level-name": "world",
      "enable-query": "false",
      "management-server-enabled": "false",
    });
    await writeFile(path, serializeProperties(next), { mode: 0o600 });
    return this.get(name);
  }
}
