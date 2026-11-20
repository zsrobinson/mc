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
const app = new Hono();
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
    c.set("email" as never, payload.email as never);
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
    email: c.get("email" as never),
    services: JSON.parse(readFileSync(required("SERVICE_MANIFEST"), "utf8")),
  }),
);
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
  const q = new URLSearchParams({
    query: (c.req.query("q") || "").slice(0, 100),
    limit: "12",
    facets: JSON.stringify(facets),
  });
  const r = await fetch("https://api.modrinth.com/v2/search?" + q, {
    headers: { "User-Agent": "mc-panel/1.0" },
  });
  return c.json(await r.json(), r.ok ? 200 : 502);
});
app.post("/api/control", async (c) => {
  try {
    if (Number(c.req.header("Content-Length") || 0) > 24 * 1024 * 1024)
      return c.json({ error: "Request too large" }, 413);
    const r = await fetch(required("HELPER_URL"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Bearer " +
          readFileSync(required("HELPER_SECRET_FILE"), "utf8").trim(),
      },
      body: await c.req.text(),
      signal: AbortSignal.timeout(1_200_000),
    });
    return c.json(await r.json(), r.status as 200);
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
  hostname: "127.0.0.1",
  port: Number(required("PORT")),
});
