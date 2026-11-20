import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js";
import { ConfigStore } from "../control/config";
import { Docker } from "../control/docker";
import { Upstream } from "../control/upstream";
import { Backups, retentionCandidates } from "../control/backups";
import { Control } from "../control/service";
import { helperApp } from "../helper";
import type { ServerConfig } from "../src/domain";
const config: ServerConfig = {
  name: "sample",
  version: "1.21.1",
  memory: 2048,
  port: 28000,
  mods: [],
  datapacks: [],
  javaTag: "java21",
};
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "mc-control-"));
  const store = new ConfigStore(join(dir, "servers"), {
    portMin: 28000,
    portMax: 28009,
    memoryBudget: 7168,
    maxServers: 3,
  });
  await store.write(config);
  const upstream = new Upstream();
  const docker = new Docker(store, upstream, 2);
  const backups = new Backups(join(dir, "backups"), docker, []);
  const control = new Control(store, docker, upstream, backups);
  return { dir, store, upstream, docker, backups, control };
}

test("configuration rejects path escapes, symlinks, unknown keys, ports and shared memory overcommit", async () => {
  const f = await fixture();
  try {
    for (const name of ["../other", "/tmp/other", "bad;command", "bad-name"])
      await assert.rejects(() => f.store.folder(name));
    await mkdir(join(f.dir, "outside"));
    await symlink(join(f.dir, "outside"), join(f.store.root, "linked"));
    await assert.rejects(() => f.store.folder("linked"));
    await assert.rejects(() =>
      f.store.validate({ ...config, image: "arbitrary" }),
    );
    await assert.rejects(() => f.store.validate({ ...config, port: 27999 }));
    await assert.rejects(() => f.store.validate({ ...config, memory: 6657 }));
    await f.store.write({
      ...config,
      name: "second",
      port: 28001,
      memory: 3072,
    });
    await assert.rejects(() => f.store.validate({ ...config, memory: 3073 }));
    await assert.rejects(() =>
      f.store.validate({ ...config, name: "third", port: 28001 }),
    );
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test("Docker operations reject unlabelled containers and mismatched storage", async () => {
  const f = await fixture();
  try {
    const cases = [
      { Config: { Labels: {} }, Mounts: [] },
      {
        Config: { Labels: { "io.mc.managed": "true", "io.mc.name": "sample" } },
        Mounts: [{ Destination: "/data", Source: "/wrong" }],
      },
    ];
    for (const value of cases) {
      let calls = 0;
      const docker = new Docker(f.store, f.upstream, 2, async () =>
        ++calls === 1 ? "abcdef" : JSON.stringify([value]),
      );
      await assert.rejects(() => docker.container("sample"));
    }
    let invoked = false;
    const docker = new Docker(f.store, f.upstream, 2, async () => {
      invoked = true;
      return "";
    });
    await assert.rejects(() => docker.rcon("sample", "list\nstop"));
    assert.equal(invoked, false);
    const rootful = new Docker(f.store, f.upstream, 2, async () =>
      JSON.stringify(["name=seccomp"]),
    );
    await assert.rejects(() => rootful.rootless());
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test("target Java and project compatibility are mandatory; downgrades are refused", async () => {
  const f = await fixture();
  try {
    f.upstream.releases = async () => [
      {
        id: "1.21.1",
        type: "release",
        url: "https://example.test/current",
        releaseTime: "2024-08-08",
      },
      {
        id: "1.20.1",
        type: "release",
        url: "https://example.test/old",
        releaseTime: "2023-06-12",
      },
    ];
    await assert.rejects(() => f.upstream.noDowngrade("1.21.1", "1.20.1"));
    f.upstream.check = async () => ({
      version: config.version,
      javaTag: "java21",
      projects: [],
    });
    await assert.rejects(() =>
      f.control.validate({ ...config, javaTag: "java25" }),
    );
    f.upstream.check = async () => ({
      version: config.version,
      javaTag: "java21",
      projects: [
        {
          project: "project",
          kind: "mod",
          compatible: false,
          version: null,
          id: null,
        },
      ],
    });
    await assert.rejects(() => f.control.validate(config));
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test("failed remote backup prevents config writes and container recreation", async () => {
  const f = await fixture();
  try {
    f.upstream.java = async () => config.javaTag;
    f.upstream.check = async () => ({
      version: config.version,
      javaTag: config.javaTag,
      projects: [],
    });
    f.backups.backup = async () => {
      throw Error("Replica failed");
    };
    let write = false,
      recreate = false;
    f.store.write = async () => {
      write = true;
    };
    f.docker.recreate = async () => {
      recreate = true;
    };
    await assert.rejects(() =>
      f.control.dispatch({
        verb: "apply-config",
        name: "sample",
        payload: { memory: 1024 },
      }),
    );
    assert.equal(write, false);
    assert.equal(recreate, false);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test("helper serializes operations and rejects unauthenticated or unknown requests", async () => {
  const f = await fixture();
  try {
    const events: string[] = [];
    f.backups.backup = async () => {
      events.push("start");
      await new Promise((r) => setTimeout(r, 10));
      events.push("end");
      return { snapshot: "test", replicated: true };
    };
    await Promise.all([
      f.control.dispatch({ verb: "backup-now", name: "sample" }),
      f.control.dispatch({ verb: "backup-now", name: "sample" }),
    ]);
    assert.deepEqual(events, ["start", "end", "start", "end"]);
    const secret = "test-only-secret-with-at-least-32-characters";
    const app = helperApp(f.control, secret);
    assert.equal(
      (await app.request("/", { method: "POST", body: "{}" })).status,
      401,
    );
    const headers = {
      Authorization: "Bearer " + secret,
      "Content-Type": "application/json",
    };
    assert.equal(
      (
        await app.request("/", {
          method: "POST",
          headers,
          body: JSON.stringify({
            verb: "shell",
            payload: { command: "anything" },
          }),
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await app.request("/", {
          method: "POST",
          headers,
          body: JSON.stringify({ verb: "status", name: "unmanaged" }),
        })
      ).status,
      404,
    );
    const result = await app.request("/", {
      method: "POST",
      headers,
      body: JSON.stringify({ verb: "limits" }),
    });
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), f.store.limits);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test("save-on runs even when archive creation or flushing fails", async () => {
  const f = await fixture();
  try {
    const calls: string[] = [];
    f.docker.container = async () => ({
      Id: "id",
      Config: { Labels: {} },
      Mounts: [],
      State: { Running: true, Status: "running" },
    });
    f.docker.rcon = async (_name, command) => {
      calls.push(command);
      if (command === "save-all flush") throw Error("Flush failed");
      return "";
    };
    await assert.rejects(() => f.backups.backup("sample"));
    assert.deepEqual(calls, ["save-off", "save-all flush", "save-on"]);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test("datapacks cannot escape their directory or overwrite existing files", async () => {
  const f = await fixture();
  try {
    const writer = new ZipWriter(new BlobWriter());
    await writer.add("pack.mcmeta", new TextReader('{"pack":{}}'));
    await writer.add("../escape", new TextReader("no"));
    const zip = await writer.close();
    const data = Buffer.from(await zip.arrayBuffer()).toString("base64");
    let backedUp = false;
    f.backups.backup = async () => {
      backedUp = true;
      return { snapshot: "test", replicated: true };
    };
    await assert.rejects(() =>
      f.control.dispatch({
        verb: "upload-datapack",
        name: "sample",
        payload: { filename: "pack.zip", data },
      }),
    );
    assert.equal(backedUp, false);
    await mkdir(join(f.store.root, "sample/data/world/datapacks"), {
      recursive: true,
    });
    await writeFile(
      join(f.store.root, "sample/data/world/datapacks/existing.zip"),
      "keep",
    );
    await assert.rejects(() =>
      f.control.dispatch({
        verb: "upload-datapack",
        name: "sample",
        payload: { filename: "../existing.zip", data },
      }),
    );
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test("retention only selects owned snapshot identifiers and retains daily and weekly snapshots", () => {
  const ids = Array.from({ length: 90 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 0, 1 + i));
    return (
      d
        .toISOString()
        .replaceAll(/[-:]/g, "")
        .replace(/\.\d+Z$/, "Z") + "-abcdef"
    );
  });
  const pruned = retentionCandidates([
    ...ids,
    "other-data",
    "20260101T000000Z.partial",
  ]);
  assert.ok(pruned.length > 0);
  assert.ok(!pruned.includes("other-data"));
  assert.ok(ids.slice(-14).every((id) => !pruned.includes(id)));
  assert.ok(ids.length - pruned.length <= 34);
});

test("backups omit RCON credentials and normalize archive modes", async () => {
  const f = await fixture();
  try {
    const secret = "a-test-only-secret-to-remove-from-backups";
    const root = join(f.store.root, "sample");
    await mkdir(join(root, "data"), { recursive: true });
    await writeFile(join(root, "rcon.secret"), secret);
    await writeFile(
      join(root, "data/server.properties"),
      "motd=Test\nrcon.password=" + secret + "\n",
    );
    await writeFile(
      join(root, "data/.rcon-cli.env"),
      "RCON_PASSWORD=" + secret,
    );
    await writeFile(
      join(root, "data/test.txt"),
      "prefix " + secret + " suffix",
    );
    const { createArchive } = await import("../control/archive");
    const archive = join(f.dir, "test.tar.gz");
    await createArchive(root, archive, secret);
    const tar = await import("tar");
    const { readFile } = await import("node:fs/promises");
    const { gunzipSync } = await import("node:zlib");
    const bytes = gunzipSync(await readFile(archive));
    assert.equal(bytes.includes(Buffer.from(secret)), false);
    const names: string[] = [];
    await tar.t({
      file: archive,
      onReadEntry: (entry) => {
        names.push(entry.path);
        assert.equal(
          (entry.mode ?? 0) & 0o777,
          entry.type === "Directory" ? 0o700 : 0o600,
        );
      },
    });
    assert.ok(!names.includes("rcon.secret"));
    assert.ok(!names.includes("data/.rcon-cli.env"));
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test("manual snapshots cannot evict other daily dates and pinned snapshots have independent retention", () => {
  const now = Date.UTC(2026, 10, 20);
  const daily = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now - i * 86400000);
    return (
      d
        .toISOString()
        .replaceAll(/[-:]/g, "")
        .replace(/\.\d+Z$/, "Z") + "-abcdef"
    );
  });
  const manual = Array.from(
    { length: 100 },
    (_, i) =>
      `20261120T12${String(Math.floor(i / 60)).padStart(2, "0")}${String(i % 60).padStart(2, "0")}Z-abcdef`,
  );
  const pinned = [
    { id: "20261119T000000Z-abcdef", pinned: true },
    { id: "20261118T000000Z-abcdef", pinned: true },
  ];
  const pruned = retentionCandidates([...daily, ...manual, ...pinned], now);
  assert.ok(daily.slice(1).every((id) => !pruned.includes(id)));
  assert.ok(pinned.every((s) => !pruned.includes(s.id)));
});

test("server.properties editor redacts RCON and refuses network-boundary changes", async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.store.root, "sample/data"), { recursive: true });
    await writeFile(
      join(f.store.root, "sample/data/server.properties"),
      "rcon.password=test-password\nrcon.port=25575\nenable-rcon=true\nserver-port=25565\nlevel-name=world\ndifficulty=normal\n",
    );
    const properties = f.control.management.properties;
    const result = await properties.get("sample");
    assert.ok(!JSON.stringify(result).includes("test-password"));
    assert.equal(result.values["rcon.password"], undefined);
    await assert.rejects(() =>
      properties.set("sample", {
        raw: result.raw.replace("server-port=25565", "server-port=28001"),
        confirm: true,
      }),
    );
    await properties.set("sample", {
      values: { difficulty: "hard", "max-players": 12 },
      confirm: true,
    });
    const internal = await properties.internal("sample");
    assert.equal(internal.values["rcon.password"], "test-password");
    assert.equal(internal.values.difficulty, "hard");
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test("file browsing blocks traversal, symlinks and RCON configuration files", async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.store.root, "sample/data/config"), { recursive: true });
    await writeFile(join(f.dir, "outside.txt"), "outside");
    await symlink(
      join(f.dir, "outside.txt"),
      join(f.store.root, "sample/data/config/link.txt"),
    );
    await writeFile(join(f.store.root, "sample/data/.rcon-cli.env"), "secret");
    const files = f.control.management.files;
    await assert.rejects(() => files.read("sample", "../config.json"));
    await assert.rejects(() => files.read("sample", "config/link.txt"));
    await assert.rejects(() => files.download("sample", ".rcon-cli.env"));
    await files.write("sample", "config/example.json", '{"enabled":true}');
    assert.equal(
      (await files.read("sample", "config/example.json")).text,
      '{"enabled":true}',
    );
    await files.remove("sample", "config/example.json");
    const retained = await import("node:fs/promises").then((fs) =>
      fs.readdir(join(f.store.root, "sample/retained-files")),
    );
    assert.equal(retained.length, 1);
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});

test("destructive world and server actions require a matching explicit confirmation", async () => {
  const f = await fixture();
  try {
    await assert.rejects(() =>
      f.control.dispatch({
        verb: "reset-world",
        name: "sample",
        payload: { confirm: true, confirmName: "other" },
      }),
    );
    await assert.rejects(() =>
      f.control.dispatch({
        verb: "delete-server",
        name: "sample",
        payload: { confirmName: "sample" },
      }),
    );
    await assert.rejects(() =>
      f.control.dispatch({ verb: "kill", name: "sample", payload: {} }),
    );
    await assert.rejects(() =>
      f.control.dispatch({
        verb: "delete-file",
        name: "sample",
        payload: { path: "config/example.json" },
      }),
    );
  } finally {
    await rm(f.dir, { recursive: true, force: true });
  }
});
