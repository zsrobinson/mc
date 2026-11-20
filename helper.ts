import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getRequestListener } from "@hono/node-server";
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { readFile, lstat, unlink, chmod, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ZodError } from "zod";
import { ConfigStore, required, exists } from "./control/config";
import { Docker } from "./control/docker";
import { Upstream } from "./control/upstream";
import { Backups, targetsSchema } from "./control/backups";
import { Control } from "./control/service";
export function helperApp(control: Control, secret: string) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const actual = Buffer.from(c.req.header("Authorization") ?? "");
    const expected = Buffer.from("Bearer " + secret);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return c.json({ error: "Authentication required" }, 401);
    await next();
  });
  app.use(
    "*",
    bodyLimit({
      maxSize: 24 * 1024 * 1024,
      onError: (c) => c.json({ error: "Request too large" }, 413),
    }),
  );
  app.post("/", async (c) => {
    try {
      return c.json(await control.dispatch(await c.req.json()));
    } catch (e) {
      if (e instanceof ZodError)
        return c.json(
          { error: e.issues.map((i) => i.message).join("; ") },
          400,
        );
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "ENOENT")
        return c.json({ error: "Managed server not found" }, 404);
      console.error(
        "Control operation failed:",
        e instanceof Error ? e.name : "unknown",
      );
      return c.json(
        { error: e instanceof Error ? e.message : "Operation failed" },
        400,
      );
    }
  });
  return app;
}
export async function main() {
  process.umask(0o077);
  const upstream = new Upstream();
  const store = new ConfigStore(required("MC_ROOT"), {
    portMin: Number(required("MC_PORT_MIN")),
    portMax: Number(required("MC_PORT_MAX")),
    memoryBudget: Number(required("MC_MEMORY_BUDGET_MIB")),
    maxServers: Number(required("MC_MAX_SERVERS")),
  });
  const docker = new Docker(store, upstream, Number(required("MC_CPUS")));
  await docker.rootless();
  const backups = new Backups(
    resolve(required("MC_BACKUP_ROOT")),
    docker,
    targetsSchema.parse(JSON.parse(required("MC_BACKUP_TARGETS"))),
  );
  const addresses = {
    joinDomain: process.env.MC_JOIN_DOMAIN,
    directHost: process.env.MC_DIRECT_HOST,
  };
  for (const value of Object.values(addresses))
    if (value && !/^[a-zA-Z0-9.-]+$/.test(value))
      throw Error("Invalid join address configuration");
  const control = new Control(store, docker, upstream, backups, addresses);
  const token = (
    await readFile(required("MC_HELPER_SECRET_FILE"), "utf8")
  ).trim();
  if (token.length < 32)
    throw Error("Helper secret must have at least 32 characters");
  const path = required("MC_HELPER_SOCKET");
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  if (await exists(path)) {
    if (!(await lstat(path)).isSocket())
      throw Error("Socket path is not a socket");
    await unlink(path);
  }
  const server = createServer(
    getRequestListener(helperApp(control, token).fetch),
  );
  server.requestTimeout = 1_200_000;
  server.listen(path, async () => {
    await chmod(path, 0o600);
  });
  const stop = () => server.close(() => process.exit());
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)
)
  main().catch(() => {
    console.error("Helper startup failed; inspect private configuration");
    process.exit(1);
  });
