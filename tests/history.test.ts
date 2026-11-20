import { test } from "node:test";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mountHistory, metrics, ranges } from "../web/history";
test("history limits queries, validates known servers, chooses steps and caches", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mc-history-"));
  let calls = 0;
  let unavailable = false;
  const helper = createServer((req, res) => {
    assert.equal(req.headers.authorization, "Bearer test-secret");
    res.end(JSON.stringify([{ name: "phelix" }]));
  });
  const prometheus = createServer((req, res) => {
    const url = new URL(req.url!, "http://local");
    assert.ok(
      Object.values(metrics).includes(url.searchParams.get("query") as never),
    );
    assert.equal(Number(url.searchParams.get("step")), ranges["1h"][1]);
    calls++;
    if (unavailable) {
      res.writeHead(503);
      res.end();
      return;
    }
    res.end(
      JSON.stringify({
        status: "success",
        data: {
          result: [
            { metric: { server: "phelix" }, values: [[100, "2"]] },
            { metric: { server: "unknown" }, values: [[100, "8"]] },
          ],
        },
      }),
    );
  });
  const previous = { ...process.env };
  try {
    await new Promise<void>((r) => helper.listen(join(dir, "helper.sock"), r));
    await new Promise<void>((r) => prometheus.listen(0, "127.0.0.1", r));
    await writeFile(join(dir, "secret"), "test-secret");
    process.env.HELPER_SOCKET = join(dir, "helper.sock");
    process.env.HELPER_SECRET_FILE = join(dir, "secret");
    process.env.PROMETHEUS_URL = `http://127.0.0.1:${(prometheus.address() as { port: number }).port}`;
    const app = new Hono();
    mountHistory(app);
    for (const query of [
      "range=forever",
      "range=__proto__",
      "query=up",
      "server=phelix%22",
    ])
      assert.equal((await app.request("/api/history?" + query)).status, 400);
    assert.equal(
      (await app.request("/api/history?server=missing")).status,
      404,
    );
    assert.equal(calls, 0);
    const r = await app.request("/api/history?range=1h&server=phelix");
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.equal(data.step, 30);
    assert.equal(data.series.players.length, 1);
    assert.equal(calls, Object.keys(metrics).length);
    await app.request("/api/history?range=1h&server=phelix");
    assert.equal(calls, Object.keys(metrics).length);
    unavailable = true;
    assert.equal((await app.request("/api/history?range=1h")).status, 502);
    delete process.env.PROMETHEUS_URL;
    assert.equal((await app.request("/api/history")).status, 503);
  } finally {
    for (const key of [
      "HELPER_SOCKET",
      "HELPER_SECRET_FILE",
      "PROMETHEUS_URL",
    ]) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    helper.close();
    prometheus.close();
    await rm(dir, { recursive: true, force: true });
  }
});
