import type { Compatibility, ServerConfig } from "../src/domain";
import { projectSchema } from "./config";
type Release = { id: string; type: string; url: string; releaseTime: string };
export type Build = {
  id: string;
  version_number: string;
  files: {
    filename: string;
    url: string;
    primary: boolean;
    hashes: { sha512: string };
  }[];
};
export class Upstream {
  private cache = new Map<string, { expires: number; value: unknown }>();
  async json<T>(url: string): Promise<T> {
    const cached = this.cache.get(url);
    if (cached && cached.expires > Date.now()) return cached.value as T;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(url, {
          headers: {
            "User-Agent": "mc-control/1.0 (self-hosted Minecraft manager)",
          },
          signal: AbortSignal.timeout(20000),
        });
        if (!r.ok) throw Error(`Upstream request failed (${r.status})`);
        const value: unknown = await r.json();
        this.cache.set(url, { expires: Date.now() + 60000, value });
        return value as T;
      } catch (e) {
        if (attempt === 2) throw e;
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    throw Error("Upstream unavailable");
  }
  async releases() {
    return (
      await this.json<{ versions: Release[] }>(
        "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json",
      )
    ).versions.filter((v) => v.type === "release");
  }
  async java(version: string) {
    const v = (await this.releases()).find((v) => v.id === version);
    if (!v) throw Error("Choose an official stable Minecraft release");
    const major = (
      await this.json<{ javaVersion: { majorVersion: number } }>(v.url)
    ).javaVersion.majorVersion;
    if (![8, 16, 17, 21, 25].includes(major))
      throw Error("Java image needs operator review");
    return "java" + major;
  }
  async noDowngrade(current: string, target: string) {
    if (current === target) return;
    const releases = await this.releases();
    const a = releases.find((v) => v.id === current),
      b = releases.find((v) => v.id === target);
    if (!a || !b) throw Error("Unknown release");
    if (b.releaseTime < a.releaseTime)
      throw Error("Downgrading is unsafe; restore a matching backup instead");
  }
  async builds(project: string, version: string, kind: "mod" | "datapack") {
    projectSchema.parse(project);
    const q = new URLSearchParams({
      game_versions: JSON.stringify([version]),
      loaders: JSON.stringify([kind === "mod" ? "fabric" : "datapack"]),
    });
    return this.json<Build[]>(
      "https://api.modrinth.com/v2/project/" + project + "/version?" + q,
    );
  }
  async check(c: ServerConfig, version: string): Promise<Compatibility> {
    const projects = await Promise.all(
      (
        [
          ["mod", c.mods],
          ["datapack", c.datapacks],
        ] as const
      ).flatMap(([kind, projects]) =>
        projects.map(async (project) => {
          if (kind === "mod") {
            const meta = await this.json<{
              server_side: string;
              client_side: string;
            }>("https://api.modrinth.com/v2/project/" + project);
            if (
              meta.server_side === "unsupported" ||
              meta.client_side === "required"
            )
              throw Error(
                "Mod is incompatible with vanilla clients: " + project,
              );
          }
          const build = (await this.builds(project, version, kind))[0];
          return {
            project,
            kind,
            compatible: !!build,
            version: build?.version_number ?? null,
            id: build?.id ?? null,
          };
        }),
      ),
    );
    return { version, javaTag: await this.java(version), projects };
  }
}
