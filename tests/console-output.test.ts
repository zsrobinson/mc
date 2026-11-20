import assert from "node:assert/strict";
import { test } from "node:test";
import { stripAnsi } from "../panel/src/lib/console-output.js";
test("console strips SGR colours and resets without changing log text", () => {
  assert.equal(
    stripAnsi("\x1b[32mReady\x1b[39m\n\x1b[0;39m[Server] 20 players\x1b[0m"),
    "Ready\n[Server] 20 players",
  );
  assert.equal(
    stripAnsi("plain Unicode 世界 and [39m text"),
    "plain Unicode 世界 and [39m text",
  );
});
