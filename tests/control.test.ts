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
import type { ServerConfig, Compatibility } from "../src/domain";
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
  assert.ok(ids.length - pruned.length <= 22);
});
