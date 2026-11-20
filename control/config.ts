import {
  mkdir,
  readFile,
  rename,
  writeFile,
  lstat,
  readdir,
  chmod,
} from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { ServerConfig, Limits } from "../src/domain";
export const nameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]{0,23}$/, "Use lowercase letters and numbers");
export const projectSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const configSchema = z
  .object({
    name: nameSchema,
    version: z.string().regex(/^\d+\.\d+(?:\.\d+)?$/),
    memory: z.number().int().min(512),
    port: z.number().int(),
    mods: z.array(projectSchema).max(50),
    datapacks: z.array(projectSchema).max(50),
    javaTag: z.string(),
  })
  .strict();
export const patchSchema = configSchema
  .omit({ name: true, javaTag: true })
  .partial()
  .strict();
export function required(key: string) {
  const value = process.env[key];
  if (!value) throw Error(`Missing ${key}`);
  return value;
}
export async function atomic(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = path + "." + randomUUID() + ".tmp";
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, path);
  await chmod(path, 0o600);
}
export async function exists(path: string) {
  try {
    await lstat(path);
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw e;
  }
}
export class ConfigStore {
  readonly root: string;
  constructor(
    root: string,
    readonly limits: Limits,
  ) {
    this.root = resolve(root);
  }
  async folder(name: string) {
    nameSchema.parse(name);
    const path = join(this.root, name);
    if ((await exists(path)) && (await lstat(path)).isSymbolicLink())
      throw Error("Invalid server directory");
    return path;
  }
  async read(name: string): Promise<ServerConfig> {
    return configSchema.parse(
      JSON.parse(
        await readFile(join(await this.folder(name), "config.json"), "utf8"),
      ),
    );
  }
  async list() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const entries = await readdir(this.root, { withFileTypes: true });
    const configs: ServerConfig[] = [];
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        !entry.isSymbolicLink() &&
        (await exists(join(this.root, entry.name, "config.json")))
      )
        configs.push(await this.read(entry.name));
    }
    return configs;
  }
  async validate(input: unknown, creating = false) {
    const c = configSchema.parse(input);
    const others = (await this.list()).filter((x) => x.name !== c.name);
    if (c.port < this.limits.portMin || c.port > this.limits.portMax)
      throw Error("Port outside allowed range");
    if (creating && others.length >= this.limits.maxServers)
      throw Error("Server count limit reached");
    if (others.some((x) => x.port === c.port))
      throw Error("Port already allocated");
    if (
      others.reduce((sum, x) => sum + x.memory + 512, 0) + c.memory + 512 >
      this.limits.memoryBudget
    )
      throw Error("Total container memory budget exceeded");
    return c;
  }
  async write(c: ServerConfig) {
    await atomic(join(await this.folder(c.name), "config.json"), c);
  }
}
