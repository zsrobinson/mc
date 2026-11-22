import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gzipSync } from "node:zlib";
import { BlobReader, BlobWriter, TextReader, ZipReader, ZipWriter } from "@zip.js/zip.js";
import { ConfigStore } from "../control/config";
import { Docker } from "../control/docker";
import { Upstream } from "../control/upstream";
import { Backups } from "../control/backups";
import { Control } from "../control/service";
import { Intents, IntentError, auditDetail } from "../control/audit";
import { dueDate, nextRun, type Task } from "../control/tasks";
import { detectCrash, runTask } from "../control/scheduler";
import { helperApp } from "../helper";
import type { ServerConfig } from "../src/domain";

const config: ServerConfig = {
  name: "alpha",
  version: "1.21.1",
  memory: 2048,
  port: 28000,
  mods: [],
  datapacks: [],
  javaTag: "java21",
};
const secret = "test-only-secret-with-at-least-32-characters";
const headers = { Authorization: "Bearer " + secret, "Content-Type": "application/json" };

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "mc-parity-"));
  const store = new ConfigStore(join(dir, "servers"), {
    portMin: 28000,
    portMax: 28009,
    memoryBudget: 7168,
    maxServers: 3,
  });
  await store.write(config);
  await mkdir(join(store.root, "alpha/data"), { recursive: true });
  const upstream = new Upstream();
  const docker = new Docker(store, upstream, 2);
  const backups = new Backups(join(dir, "backups"), docker, []);
  docker.container = async () => undefined;
  const rcon: string[] = [];
  docker.rcon = async (_name: string, command: string) => {
    rcon.push(command);
    return "ok";
  };
  backups.backup = async () => ({ snapshot: "test", replicated: true as const });
  const control = new Control(store, docker, upstream, backups);
  const app = helperApp(control, secret);
  const call = (body: unknown) =>
    app.request("/", { method: "POST", headers, body: JSON.stringify(body) });
  const data = (path = "") => join(store.root, "alpha/data", path);
  return { dir, store, docker, backups, control, app, call, rcon, data };
}
type F = Awaited<ReturnType<typeof fixture>>;
async function withFixture(fn: (f: F) => Promise<void>) {
  const f = await fixture();
  try {
    await fn(f);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
}

test("activity log records mutations with actor and metadata, never reads or command text", () =>
  withFixture(async (f) => {
    assert.equal((await f.call({ verb: "files", name: "alpha" })).status, 200);
    const r = await f.call({
      verb: "rcon",
      name: "alpha",
      payload: { command: "say secret plans at spawn" },
      actor: "owner@example.com",
    });
    assert.equal(r.status, 200);
    await f.call({ verb: "make-directory", name: "alpha", payload: { path: "notes" }, actor: "owner@example.com" });
    await f.call({ verb: "make-directory", name: "alpha", payload: { path: "notes" } });
    const log = await (await f.call({ verb: "audit", payload: { limit: 10 } })).json();
    assert.equal(log.entries.length, 3);
    const [failed, made, rcon] = log.entries;
    assert.equal(failed.outcome, "error");
    assert.equal(failed.actor, "cli");
    assert.equal(made.verb, "make-directory");
    assert.equal(made.detail, "path: notes");
    assert.equal(made.actor, "owner@example.com");
    assert.equal(rcon.verb, "rcon");
    assert.equal(rcon.detail, undefined);
    const raw = await readFile(join(f.store.root, "audit.jsonl"), "utf8");
    assert.ok(!raw.includes("secret plans"));
    assert.ok(!raw.includes('"verb":"files"'));
    const filtered = await (
      await f.call({ verb: "audit", name: "alpha", payload: { limit: 1 } })
    ).json();
    assert.equal(filtered.entries.length, 1);
    assert.equal(filtered.more, true);
    const older = await (
      await f.call({ verb: "audit", payload: { before: filtered.entries[0].at } })
    ).json();
    assert.ok(older.entries.every((e: { at: string }) => e.at < filtered.entries[0].at));
    assert.equal((await f.call({ verb: "rcon", name: "alpha", payload: { command: "list" }, actor: "bad actor!" })).status, 400);
    assert.equal(auditDetail("write-file", { path: "a.json", text: "contents" }), "path: a.json");
  }));

test("destructive verbs need typed name and a single-use, server-bound intent", () =>
  withFixture(async (f) => {
    await f.store.write({ ...config, name: "bravo", port: 28001 });
    const intent = async (action: string, name = "alpha") =>
      (await (await f.call({ verb: "confirm-intent", name, payload: { action } })).json()).token as string;
    let removed = 0;
    f.control.management.worlds.removeServer = async () => {
      removed++;
      return { deleted: true, retained: true };
    };
    const del = (payload: Record<string, unknown>) =>
      f.call({ verb: "delete-server", name: "alpha", payload: { confirm: true, confirmName: "alpha", ...payload } });
    assert.equal((await del({})).status, 409);
    assert.equal((await del({ intent: "forged" })).status, 409);
    assert.equal((await del({ intent: await intent("reset-world") })).status, 409);
    assert.equal((await del({ intent: await intent("delete-server", "bravo") })).status, 409);
    const token = await intent("delete-server");
    assert.equal((await del({ intent: token, confirmName: "Alpha" })).status, 400);
    const good = await intent("delete-server");
    assert.equal((await del({ intent: good })).status, 200);
    assert.equal((await del({ intent: good })).status, 409);
    assert.equal(removed, 1);
    let killed = 0;
    f.docker.kill = async () => {
      killed++;
    };
    const kill = (payload: Record<string, unknown>) => f.call({ verb: "kill", name: "alpha", payload });
    assert.equal((await kill({ confirm: true, confirmName: "alpha" })).status, 409);
    assert.equal((await kill({ confirm: true, intent: await intent("kill") })).status, 400);
    assert.equal((await kill({ confirm: true, confirmName: "alpha", intent: await intent("kill") })).status, 200);
    assert.equal(killed, 1);
    const upload = await f.app.request(
      "/upload?verb=upload-world&name=alpha&confirm=true&confirmName=alpha&intent=nope",
      { method: "POST", headers: { Authorization: "Bearer " + secret }, body: "x" },
    );
    assert.equal(upload.status, 409);
    const short = new Intents(1);
    const expiring = short.issue("kill", "alpha");
    await new Promise((r) => setTimeout(r, 5));
    assert.throws(() => short.consume("kill", "alpha", expiring.token), IntentError);
    assert.equal((await f.call({ verb: "confirm-intent", name: "alpha", payload: { action: "start" } })).status, 400);
  }));

test("file manager creates folders and renames within data, refusing protected, secret and escaping paths", () =>
  withFixture(async (f) => {
    await mkdir(f.data("world"), { recursive: true });
    await writeFile(f.data("notes.txt"), "hello");
    const ok = async (verb: string, payload: unknown) => {
      const r = await f.call({ verb, name: "alpha", payload });
      assert.equal(r.status, 200, verb + " " + JSON.stringify(payload) + " " + (await r.clone().text()));
      return r.json();
    };
    const refused = async (verb: string, payload: unknown) =>
      assert.equal((await f.call({ verb, name: "alpha", payload })).status, 400, verb + " " + JSON.stringify(payload));
    await ok("make-directory", { path: "config" });
    await ok("make-directory", { path: "config/nested" });
    await refused("make-directory", { path: "config" });
    await refused("make-directory", { path: "missing/child" });
    await refused("make-directory", { path: "../escape" });
    await refused("make-directory", { path: "world/region2" });
    await refused("make-directory", { path: "rcon-stuff" });
    await ok("rename-file", { from: "notes.txt", to: "config/readme.txt" });
    assert.equal(await readFile(f.data("config/readme.txt"), "utf8"), "hello");
    await ok("rename-file", { from: "config/nested", to: "nested" });
    await refused("rename-file", { from: "config", to: "config/inside" });
    await refused("rename-file", { from: "world", to: "old-world" });
    await refused("rename-file", { from: "config/readme.txt", to: "server.properties" });
    await refused("rename-file", { from: "config/readme.txt", to: "nested" });
    await refused("rename-file", { from: "config/readme.txt", to: "../../x.txt" });
    await refused("rename-file", { from: "config/readme.txt", to: "token.txt" });
    await writeFile(join(f.dir, "outside.txt"), "outside");
    await symlink(join(f.dir, "outside.txt"), f.data("link.txt"));
    await refused("rename-file", { from: "link.txt", to: "moved.txt" });
    const listing = await ok("files", { path: "config" });
    const readme = listing.entries.find((e: { name: string }) => e.name === "readme.txt");
    assert.equal(readme.editable, true);
    assert.equal(readme.archive, false);
  }));

test("zip archives round-trip and extraction refuses traversal, symlinks, secrets and overwrites", () =>
  withFixture(async (f) => {
    await mkdir(f.data("config/sub"), { recursive: true });
    await writeFile(f.data("config/a.json"), '{"a":1}');
    await writeFile(f.data("config/sub/b.txt"), "bee");
    await writeFile(f.data("config/rcon.secret"), "never");
    const r = await f.call({
      verb: "archive-files",
      name: "alpha",
      payload: { paths: ["config"], destination: "bundle.zip" },
    });
    assert.equal(r.status, 200, await r.clone().text());
    assert.equal((await r.json()).entries, 2);
    const names = await new ZipReader(new BlobReader(new Blob([await readFile(f.data("bundle.zip"))])))
      .getEntries()
      .then((e) => e.map((x) => x.filename).sort());
    assert.deepEqual(names, ["config/a.json", "config/sub/b.txt"]);
    assert.equal(
      (await f.call({ verb: "archive-files", name: "alpha", payload: { paths: ["config"], destination: "bundle.zip" } })).status,
      400,
    );
    const x = await f.call({ verb: "extract-archive", name: "alpha", payload: { path: "bundle.zip", destination: "restored" } });
    assert.equal(x.status, 200, await x.clone().text());
    assert.equal(await readFile(f.data("restored/config/sub/b.txt"), "utf8"), "bee");
    // Second extraction would overwrite: refused before writing anything.
    assert.equal(
      (await f.call({ verb: "extract-archive", name: "alpha", payload: { path: "bundle.zip", destination: "restored" } })).status,
      400,
    );
    const evil = async (file: string, entries: [string, string][], mode?: number) => {
      const writer = new ZipWriter(new BlobWriter());
      for (const [name, text] of entries)
        await writer.add(name, new TextReader(text), mode ? { externalFileAttributes: (mode << 16) >>> 0 } : {});
      await writeFile(f.data(file), Buffer.from(await (await writer.close()).arrayBuffer()));
    };
    await evil("slip.zip", [["../../escape.txt", "x"]]);
    await evil("secret.zip", [["plugins/token.txt", "x"]]);
    await evil("world.zip", [["world/level.dat", "x"]]);
    await evil("link.zip", [["link", "/etc/passwd"]], 0o120777);
    for (const file of ["slip.zip", "secret.zip", "link.zip"])
      assert.equal(
        (await f.call({ verb: "extract-archive", name: "alpha", payload: { path: file, destination: "out-" + file } })).status,
        400,
        file,
      );
    assert.equal(
      (await f.call({ verb: "extract-archive", name: "alpha", payload: { path: "world.zip", destination: "" } })).status,
      400,
    );
    assert.equal(
      (await f.call({ verb: "extract-archive", name: "alpha", payload: { path: "bundle.zip", destination: "world/x" } })).status,
      400,
    );
    assert.deepEqual(
      (await readdir(f.data())).filter((n) => n.startsWith("out-")),
      [],
    );
  }));

test("log viewer decompresses archived logs, strips ANSI and only reads log files", () =>
  withFixture(async (f) => {
    await mkdir(f.data("logs"), { recursive: true });
    await writeFile(f.data("logs/latest.log"), "\u001b[32m[12:00:00] Done (1.0s)!\u001b[0m\n");
    await writeFile(f.data("logs/2026-11-20-1.log.gz"), gzipSync("[11:00:00] Starting minecraft server\n"));
    const read = async (file: string) => f.call({ verb: "read-log", name: "alpha", payload: { file } });
    assert.deepEqual(await (await read("latest.log")).json(), {
      file: "latest.log",
      text: "[12:00:00] Done (1.0s)!\n",
      truncated: false,
    });
    assert.equal((await (await read("2026-11-20-1.log.gz")).json()).text, "[11:00:00] Starting minecraft server\n");
    for (const bad of ["../config.json", "latest.txt", "logs/latest.log", "missing.log"])
      assert.equal((await read(bad)).status, 400, bad);
  }));

test("scheduled tasks validate, compute next runs, migrate legacy settings and run through the control path", () =>
  withFixture(async (f) => {
    await writeFile(
      join(f.store.root, "alpha/schedule.json"),
      JSON.stringify({ restartAt: "05:00", backupAt: null }),
    );
    let tasks = await (await f.call({ verb: "tasks", name: "alpha" })).json();
    assert.equal(tasks.tasks.length, 1);
    assert.equal(tasks.tasks[0].kind, "restart");
    assert.equal((await (await f.call({ verb: "tasks", name: "alpha" })).json()).tasks.length, 1);
    const save = (task: unknown) => f.call({ verb: "save-task", name: "alpha", payload: { task } });
    assert.equal((await save({ kind: "command", time: "06:00", days: [], enabled: true, command: "/say hi" })).status, 400);
    assert.equal((await save({ kind: "announce", time: "06:00", days: [], enabled: true, message: "a\nb" })).status, 400);
    assert.equal((await save({ kind: "backup", time: "25:00", days: [], enabled: true })).status, 400);
    const announce = await (await save({ kind: "announce", time: "06:00", days: [1, 1, 3], enabled: true, message: "Hello" })).json();
    assert.deepEqual(announce.days, [1, 3]);
    assert.ok(announce.nextRun);
    // Legacy verb updates the existing daily restart rather than duplicating it.
    await f.call({ verb: "schedule", name: "alpha", payload: { restartAt: "04:00" } });
    tasks = await (await f.call({ verb: "tasks", name: "alpha" })).json();
    assert.equal(tasks.tasks.filter((t: Task) => t.kind === "restart").length, 1);
    assert.equal((await (await f.call({ verb: "status", name: "alpha" })).json()).schedule.restartAt, "04:00");
    assert.equal((await f.call({ verb: "delete-task", name: "alpha", payload: { id: announce.id } })).status, 400);
    const run = await f.call({ verb: "run-task", name: "alpha", payload: { id: announce.id } });
    assert.equal(run.status, 200);
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(f.rcon, ["say Hello"]);
    const audit = await (await f.call({ verb: "audit", name: "alpha" })).json();
    assert.ok(audit.entries.some((e: { actor: string; verb: string }) => e.actor === "schedule" && e.verb === "rcon"));
    assert.equal((await f.call({ verb: "delete-task", name: "alpha", payload: { id: announce.id, confirm: true } })).status, 200);
    // Next-run and due math in UTC, with the warning lead for restarts.
    const monday = Date.UTC(2026, 10, 23, 5, 30);
    assert.equal(nextRun({ time: "06:00", days: [], enabled: true }, monday), Date.UTC(2026, 10, 23, 6, 0));
    assert.equal(nextRun({ time: "05:00", days: [], enabled: true }, monday), Date.UTC(2026, 10, 24, 5, 0));
    assert.equal(nextRun({ time: "06:00", days: [3], enabled: true }, monday), Date.UTC(2026, 10, 25, 6, 0));
    assert.equal(nextRun({ time: "06:00", days: [], enabled: false }, monday), null);
    const restart: Task = { id: "x", kind: "restart", time: "05:00", days: [], enabled: true, warnMinutes: 5 };
    assert.equal(dueDate(restart, Date.UTC(2026, 10, 23, 4, 55, 10)), "2026-11-23");
    assert.equal(dueDate(restart, Date.UTC(2026, 10, 23, 5, 0)), null);
    assert.equal(dueDate({ ...restart, firedFor: "2026-11-23" }, Date.UTC(2026, 10, 23, 4, 55)), null);
    assert.equal(dueDate({ ...restart, days: [2] }, Date.UTC(2026, 10, 23, 4, 55)), null);
    // Restarts go through the serialized restart verb.
    const verbs: string[] = [];
    f.control.dispatch = (async (input: { verb: string }) => {
      verbs.push(input.verb);
      return {};
    }) as Control["dispatch"];
    await runTask(f.control, "alpha", { ...restart, warnMinutes: 0 });
    assert.deepEqual(verbs, ["restart"]);
  }));

test("crash monitor records unexpected exits and policy restarts once", () =>
  withFixture(async (f) => {
    const state = {
      Id: "c",
      Config: { Labels: {} },
      Mounts: [],
      RestartCount: 0,
      State: { Running: true, Status: "running", ExitCode: 0, FinishedAt: "0001-01-01T00:00:00Z" },
    };
    f.docker.container = async () => state as never;
    assert.deepEqual(await detectCrash(f.control, "alpha"), []);
    state.RestartCount = 1;
    assert.equal((await detectCrash(f.control, "alpha"))!.length, 1);
    assert.deepEqual(await detectCrash(f.control, "alpha"), []);
    state.State = { Running: false, Status: "exited", ExitCode: 137, FinishedAt: "2026-11-22T10:00:00Z" };
    (state.State as { OOMKilled?: boolean }).OOMKilled = true;
    assert.deepEqual(await detectCrash(f.control, "alpha"), ["exit code 137 · out of memory"]);
    assert.deepEqual(await detectCrash(f.control, "alpha"), []);
    const status = await f.control.status(config);
    assert.deepEqual(status.lastExit, { exitCode: 137, finishedAt: "2026-11-22T10:00:00Z", oomKilled: true });
    const log = await f.control.audit.list({ server: "alpha" });
    assert.equal(log.entries.filter((e) => e.verb === "crash-detected").length, 2);
  }));
