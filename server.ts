import { modrinthIcon } from "./web/modrinth";
import { metadata } from "./control/telemetry";
import { helperResponse } from "./web/helper-client";
import { bodyLimit } from "hono/body-limit";
import { request } from "node:http";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { readFileSync } from "node:fs";
const required = (key: string) => {
  const v = process.env[key];
  if (!v) throw Error(`Missing ${key}`);
  return v;
};
const issuer = required("ACCESS_ISSUER");
const audience = required("ACCESS_AUD");
const keys = createRemoteJWKSet(new URL("/cdn-cgi/access/certs", issuer));
const app = new Hono<{ Variables: { email: string } }>();
app.use("*", async (c, next) => {
  const started = Date.now();
  await next();
  void metadata("panel", "http", {
    status: c.res.status,
    durationMs: Date.now() - started,
    outcome: c.res.status < 400 ? "ok" : "error",
  });
});
app.use("*", async (c, next) => {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  try {
    const { payload } = await jwtVerify(
      c.req.header("Cf-Access-Jwt-Assertion") || "",
      keys,
      { issuer, audience },
    );
    if (typeof payload.email !== "string")
      return c.json({ error: "Access email required" }, 401);
    c.set("email", payload.email);
  } catch {
    return c.json({ error: "Cloudflare Access authentication required" }, 401);
  }
  if (
    !["GET", "HEAD"].includes(c.req.method) &&
    c.req.header("Origin") !== required("PUBLIC_ORIGIN")
  )
    return c.json({ error: "Origin rejected" }, 403);
  await next();
});
app.get("/api/session", (c) =>
  c.json({
    email: c.get("email"),
    services: JSON.parse(readFileSync(required("SERVICE_MANIFEST"), "utf8")),
  }),
);
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
    const body = await c.req.text();
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
    return c.json(JSON.parse(result.body), result.status as 200);
  } catch {
    return c.json({ error: "Control service unavailable" }, 502);
  }
});
app.use("/assets/*", async (c, next) => {
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  await next();
});
app.use("*", serveStatic({ root: "./dist" }));
app.get("*", serveStatic({ path: "./dist/index.html" }));
serve({
  fetch: app.fetch,
  hostname: process.env.BIND_ADDRESS || "127.0.0.1",
  port: Number(required("PORT")),
});
