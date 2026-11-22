import { normalizeServerRecords } from "./src/server-state";
import { mountHistory } from "./web/history";
import { modrinthIcon } from "./web/modrinth";
import { metadata } from "./control/telemetry";
import { helperResponse } from "./web/helper-client";
import { bodyLimit } from "hono/body-limit";
import { request } from "node:http";
import {
  createShellServer,
  mountStatic,
  serve,
} from "@zsrobinson/shell/server";
import { readFileSync } from "node:fs";
const required = (key: string) => {
  const v = process.env[key];
  if (!v) throw Error(`Missing ${key}`);
  return v;
};
const app = createShellServer({
  issuer: required("ACCESS_ISSUER"),
  audience: required("ACCESS_AUD"),
  publicOrigin: required("PUBLIC_ORIGIN"),
  services: () =>
    JSON.parse(readFileSync(required("SERVICE_MANIFEST"), "utf8")),
  log: (request) => {
    console.log(JSON.stringify(request));
    void metadata("panel", "http", {
      ...request,
      outcome: request.status < 400 ? "ok" : "error",
    });
  },
  // A separate scrape token never grants access to app routes.
  metrics: {
    authorize: (request) =>
      Boolean(process.env.METRICS_TOKEN) &&
      request.headers.get("Authorization") ===
        `Bearer ${process.env.METRICS_TOKEN}`,
  },
});
app.get("/api/player-head/:name", async c => {
  const name=c.req.param("name");
  if(!/^[A-Za-z0-9_]{1,16}$/.test(name))return c.body(null,400);
  try { const response=await fetch(`https://mc-heads.net/avatar/${encodeURIComponent(name)}/32`,{signal:AbortSignal.timeout(5000)});
    if(!response.ok)return c.body(null,404);
    const bytes=await response.arrayBuffer();if(bytes.byteLength>1024*1024)return c.body(null,502);
    return c.body(bytes,200,{"Content-Type":"image/png","Cache-Control":"private, max-age=3600"});
  }catch{return c.body(null,502)}
});
app.get("/api/modrinth-icon/:project", async (c) => {
  try {
    const icon = await modrinthIcon(c.req.param("project"));
    if (!icon) return c.body(null, 204);
    return new Response(Uint8Array.from(icon.data), {
      headers: {
        "Content-Type": icon.type,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return c.body(null, 404);
  }
});
app.get("/api/search", async (c) => {
  const kind = c.req.query("kind") === "datapack" ? "datapack" : "mod";
  const facets =
    kind === "mod"
      ? [
          ["project_type:mod"],
          ["categories:fabric"],
          ["server_side:required", "server_side:optional"],
          ["client_side:optional", "client_side:unsupported"],
        ]
      : [["project_type:datapack"]];
  const version = c.req.query("version");
  if (version && /^[0-9.]+$/.test(version))
    facets.push(["versions:" + version]);
  const q = new URLSearchParams({
    query: (c.req.query("q") || "").slice(0, 100),
    limit: "12",
    facets: JSON.stringify(facets),
  });
  const r = await fetch("https://api.modrinth.com/v2/search?" + q, {
    headers: { "User-Agent": "mc-panel/1.0" },
  });
  const data = (await r.json()) as {
    hits?: { slug: string; [key: string]: unknown }[];
  };
  if (data.hits)
    data.hits = data.hits.map((hit) => ({
      ...hit,
      iconUrl: "/api/modrinth-icon/" + encodeURIComponent(hit.slug),
      ...(version ? { compatible: true } : {}),
    }));
  return c.json(data, r.ok ? 200 : 502);
});
app.use(
  "/api/control",
  bodyLimit({
    maxSize: 24 * 1024 * 1024,
    onError: (c) => c.json({ error: "Request too large" }, 413),
  }),
);
for (const [route, helperPath, method] of [
  ["/api/download", "/download", "GET"],
  ["/api/upload", "/upload", "POST"],
  ["/api/console", "/console", "GET"],
] as const) {
  app.on(method, route, async (c) => {
    try {
      return await helperResponse(
        helperPath + "?" + new URL(c.req.url).searchParams.toString(),
        method,
        c.req.raw.body,
      );
    } catch {
      return c.json({ error: "Control service unavailable" }, 502);
    }
  });
}
app.post("/api/control", async (c) => {
  try {
    if (Number(c.req.header("Content-Length") || 0) > 24 * 1024 * 1024)
      return c.json({ error: "Request too large" }, 413);
    let input: unknown;
    try {
      input = JSON.parse(await c.req.text());
    } catch {
      return c.json({ error: "Invalid request" }, 400);
    }
    if (!input || typeof input !== "object" || Array.isArray(input))
      return c.json({ error: "Invalid request" }, 400);
    // The signed-in email attributes the action in the helper's activity log.
    const body = JSON.stringify({ ...input, actor: c.get("email") });
    const result = await new Promise<{ status: number; body: string }>(
      (resolve, reject) => {
        const req = request(
          {
            socketPath: required("HELPER_SOCKET"),
            path: "/",
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(body),
              Authorization:
                "Bearer " +
                readFileSync(required("HELPER_SECRET_FILE"), "utf8").trim(),
            },
          },
          (res) => {
            let data = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () =>
              resolve({ status: res.statusCode || 502, body: data }),
            );
          },
        );
        req.setTimeout(1_200_000, () =>
          req.destroy(Error("Control request timed out")),
        );
        req.on("error", reject);
        req.end(body);
      },
    );
    return c.json(normalizeServerRecords(JSON.parse(result.body)), result.status as 200);
  } catch {
    return c.json({ error: "Control service unavailable" }, 502);
  }
});
mountHistory(app);
mountStatic(app);
serve({
  fetch: app.fetch,
  hostname: process.env.BIND_ADDRESS || "127.0.0.1",
  port: Number(required("PORT")),
});
