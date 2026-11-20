import { metadata, startTelemetry } from "./control/telemetry";
import { createReadStream, createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { streamSSE } from "hono/streaming";
import { Dns } from "./control/dns";
import { startScheduler } from "./control/scheduler";
import { nameSchema } from "./control/config";
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
import { Control, requestSchema } from "./control/service";
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
    "/",
    bodyLimit({
      maxSize: 24 * 1024 * 1024,
      onError: (c) => c.json({ error: "Request too large" }, 413),
    }),
  );
  app.post("/", async (c) => {
    try {
      const input = requestSchema.parse(await c.req.json());
      if (input.verb === "create-progress")
        return c.json(control.progress(input.name || ""));
      const started = Date.now();
      try {
        const result = await control.dispatch(input);
        void metadata("helper", "operation", {
          verb: input.verb,
          server: input.name,
          outcome: "ok",
          durationMs: Date.now() - started,
        });
        return c.json(result);
      } catch (e) {
        void metadata("helper", "operation", {
          verb: input.verb,
          server: input.name,
          outcome: "error",
          durationMs: Date.now() - started,
        });
        throw e;
      }
    } catch (e) {
      if (e instanceof ZodError)
        return c.json(
          { error: e.issues.map((i) => i.message).join("; ") },
          400,
        );
      if (e instanceof SyntaxError)
        return c.json({ error: "Invalid JSON request" }, 400);
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
  app.get("/download", async (c) => {
    try {
      const query = c.req.query();
      const name = nameSchema.parse(query.name);
      const result = await control.exclusive(() =>
        control.management.download(query.verb, name, query),
      );
      const headers = {
        "Content-Type": result.type,
        "Content-Disposition":
          'attachment; filename="' +
          result.filename.replace(/[^a-zA-Z0-9_.-]/g, "_") +
          '"',
        "Cache-Control": "no-store",
      };
      if ("text" in result && result.text !== undefined)
        return new Response(result.text, { headers });
      const stream = result.stream ?? createReadStream(result.file!);
      if ("temporary" in result && result.temporary)
        stream.once("close", () => {
          rm(dirname(result.file!), { recursive: true, force: true }).catch(
            () => undefined,
          );
        });
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        headers,
      });
    } catch {
      return c.json({ error: "Download refused or unavailable" }, 400);
    }
  });
  app.post("/upload", async (c) => {
    const query = c.req.query();
    let stage: string | undefined;
    try {
      const name = nameSchema.parse(query.name);
      if (!["upload-world", "upload-file", "upload-icon"].includes(query.verb))
        throw Error("Unknown upload");
      if (!c.req.raw.body) throw Error("Upload required");
      stage = await mkdtemp(join(tmpdir(), "mc-upload-"));
      const file = join(stage, "upload");
      let bytes = 0;
      const maximum =
        query.verb === "upload-icon" ? 256 * 1024 : 512 * 1024 * 1024;
      await pipeline(
        Readable.fromWeb(
          c.req.raw.body as import("node:stream/web").ReadableStream,
        ),
        new Transform({
          transform(chunk, _encoding, done) {
            bytes += chunk.length;
            done(bytes > maximum ? Error("Upload exceeds limit") : null, chunk);
          },
        }),
        createWriteStream(file, { mode: 0o600 }),
      );
      const result = await control.exclusive(() =>
        control.management.upload(query.verb, name, file, query),
      );
      return c.json(result);
    } catch (e) {
      return c.json(
        { error: e instanceof Error ? e.message : "Upload failed" },
        400,
      );
    } finally {
      if (stage) await rm(stage, { recursive: true, force: true });
    }
  });
  app.get("/console", async (c) => {
    const name = nameSchema.parse(c.req.query("name"));
    await control.store.read(name);
    return streamSSE(c, async (stream) => {
      let previous = "";
      while (!stream.aborted) {
        try {
          const result = await control.exclusive(() =>
            control.docker.logs(name),
          );
          if (result !== previous) {
            await stream.writeSSE({
              event: "logs",
              data: JSON.stringify({ text: result }),
              id: String(Date.now()),
            });
            previous = result;
          } else await stream.writeSSE({ event: "heartbeat", data: "{}" });
        } catch {
          await stream.writeSSE({ event: "reconnecting", data: "{}" });
        }
        await stream.sleep(2500);
      }
    });
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
  if (
    process.env.MC_CGROUP_PARENT &&
    !/^[a-zA-Z0-9_.-]+\.slice$/.test(process.env.MC_CGROUP_PARENT)
  )
    throw Error("Invalid Minecraft cgroup parent");
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
  const dns = process.env.MC_DNS_ZONE_ID
    ? new Dns({
        zoneId: required("MC_DNS_ZONE_ID"),
        tokenFile: required("MC_DNS_TOKEN_FILE"),
        joinDomain: required("MC_JOIN_DOMAIN"),
        target: required("MC_DIRECT_HOST"),
        portMin: store.limits.portMin,
        portMax: store.limits.portMax,
      })
    : new Dns();
  const control = new Control(store, docker, upstream, backups, addresses, dns);
  const stopScheduler = startScheduler(control);
  const stopTelemetry = startTelemetry(control);
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
  const stop = () => {
    stopScheduler();
    stopTelemetry();
    server.close(() => process.exit());
  };
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
