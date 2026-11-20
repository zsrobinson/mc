import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import { exists } from "./config";
import { secureOpen } from "./paths";
import type { Docker } from "./docker";
import type { ServerConfig } from "../src/domain";
export type ProjectDetails = {
  slug: string;
  title: string;
  iconUrl: string;
  installedVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  compatible: boolean;
  downloads: number;
};
export async function projectDetails(docker: Docker, c: ServerConfig) {
  const root = join(await docker.store.folder(c.name), "data");
  const details = async (
    slug: string,
    kind: "mod" | "datapack",
  ): Promise<ProjectDetails> => {
    const meta = await docker.upstream.json<{
      title: string;
      downloads: number;
    }>("https://api.modrinth.com/v2/project/" + encodeURIComponent(slug));
    const builds = await docker.upstream.builds(slug, c.version, kind);
    let installedVersion: string | null = null,
      installedId: string | null = null;
    for (const build of builds) {
      for (const file of build.files) {
        if (basename(file.filename) !== file.filename)
          throw Error("Invalid project filename");
        if (!file.primary && build.files.some((f) => f.primary)) continue;
        const path = join(
          root,
          kind === "mod" ? "mods" : "world/datapacks",
          file.filename,
        );
        if (!(await exists(path))) continue;
        const handle = await secureOpen(root, path);
        const hash = createHash("sha512");
        for await (const chunk of handle.createReadStream()) hash.update(chunk);
        if (hash.digest("hex") === file.hashes.sha512) {
          installedVersion = build.version_number;
          installedId = build.id;
          break;
        }
      }
      if (installedVersion) break;
    }
    return {
      slug,
      title: meta.title,
      iconUrl: "/api/modrinth-icon/" + encodeURIComponent(slug),
      installedVersion,
      latestVersion: builds[0]?.version_number ?? null,
      updateAvailable: !!installedId && installedId !== builds[0]?.id,
      compatible: !!builds.length,
      downloads: meta.downloads,
    };
  };
  return {
    mods: await Promise.all(c.mods.map((slug) => details(slug, "mod"))),
    datapacks: await Promise.all(
      c.datapacks.map((slug) => details(slug, "datapack")),
    ),
  };
}
