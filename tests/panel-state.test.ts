import { test } from "node:test";
import assert from "node:assert/strict";
import { stateLabel, stateTone } from "../panel/src/lib/state";
test("configured servers without containers use the stopped badge", () => {
  assert.equal(stateLabel("absent"), "Stopped");
  assert.equal(stateTone("absent"), stateTone("exited"));
});

import { serverState, normalizeServerRecords } from "../src/server-state";
test("all Docker and optimistic states have only the four application labels", () => {
  for (const state of [
    "absent",
    "missing",
    "created",
    "exited",
    "paused",
    "removing",
    "stopping",
    "stopped",
    "unknown",
  ]) {
    assert.equal(stateLabel(state), "Stopped", state);
    assert.equal(stateTone(state), "off", state);
  }
  for (const state of ["starting", "restarting", "creating"]) {
    assert.equal(stateLabel(state), "Starting");
    assert.equal(stateTone(state), "busy");
  }
  for (const state of ["crashed", "dead", "unhealthy", "error"]) {
    assert.equal(stateLabel(state), "Crashed");
    assert.equal(stateTone(state), "error");
  }
  assert.equal(stateLabel("running"), "Running");
  assert.equal(stateTone("running"), "on");
});
test("running processes remain Starting until Minecraft readiness is established", () => {
  assert.equal(
    serverState({ state: "running", players: "Server is starting" }),
    "starting",
  );
  assert.equal(
    serverState({
      state: "running",
      health: "starting",
      players: "There are 0 of a max of 20 players online:",
    }),
    "starting",
  );
  assert.equal(
    serverState({
      state: "running",
      players: null,
      metrics: { tps: null, mspt: null },
    }),
    "starting",
  );
  assert.equal(
    serverState({
      state: "running",
      players: "There are 0 of a max of 20 players online:",
    }),
    "running",
  );
  assert.equal(
    serverState({ state: "running", players: null, metrics: { tps: 20 } }),
    "running",
  );
  assert.equal(
    serverState({
      state: "running",
      health: { Status: "healthy" },
      players: null,
    }),
    "running",
  );
  assert.equal(
    serverState({ state: "running", health: "unhealthy" }),
    "crashed",
  );
});
test("list, status and power replies share normalization without changing other data", () => {
  const absent = { name: "alpha", state: "absent", players: null };
  const booting = { name: "bravo", state: "running", players: null };
  assert.deepEqual(normalizeServerRecords([absent, booting]), [
    { ...absent, state: "stopped" },
    { ...booting, state: "starting" },
  ]);
  assert.deepEqual(normalizeServerRecords(booting), {
    ...booting,
    state: "starting",
  });
  assert.deepEqual(normalizeServerRecords({ error: "Unavailable" }), {
    error: "Unavailable",
  });
  assert.equal(absent.state, "absent");
});
