import { Upstream } from "../control/upstream";
import { projectSchema } from "../control/config";
const upstream = new Upstream();
const cache = new Map<
  string,
  { expires: number; type: string; data: Uint8Array }
>();
export async function modrinthIcon(project: string) {
  projectSchema.parse(project);
  const saved = cache.get(project);
  if (saved && saved.expires > Date.now()) return saved;
  const meta = await upstream.json<{ icon_url?: string }>(
    "https://api.modrinth.com/v2/project/" + encodeURIComponent(project),
  );
  if (!meta.icon_url) return null;
  const url = new URL(meta.icon_url);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "cdn.modrinth.com" ||
    url.port
  )
    throw Error("Unsupported icon source");
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok || !response.body) return null;
  const type = response.headers.get("content-type")?.split(";")[0] || "";
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(type))
    return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.length;
    if (size > 256 * 1024) throw Error("Icon too large");
    chunks.push(chunk);
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  const result = { expires: Date.now() + 3600000, type, data };
  cache.set(project, result);
  if (cache.size > 100) cache.delete(cache.keys().next().value!);
  return result;
}
