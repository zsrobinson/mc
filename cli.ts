#!/usr/bin/env node
import { request } from "node:http";
import { readFile } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
const help = `mcctl — Minecraft management through the same API as the panel

Usage:
  mcctl list [--json]
  mcctl VERB [SERVER] [--data JSON | --data-file FILE] [--confirm] [--confirm-name SERVER] [--json]
  mcctl download-world|download-file|download-log|download-backup SERVER --out FILE [--path PATH] [--snapshot ID]
  mcctl upload-world|upload-file|upload-icon SERVER --file FILE [--path PATH] --confirm [--confirm-name SERVER]

Read: status, versions, limits, logs, logs-list, players, properties, files,
      read-file, backups, restore-test, check-upgrade, check-updates
Control: start, stop, restart, kill, rcon, player-action, apply-config,
         apply-properties, set-loader, write-file, delete-file, backup-now,
         restore-backup, reset-world, schedule, create-server, delete-server

Examples:
  mcctl status sample --json
  mcctl rcon sample --data '{"command":"list"}' --json
  mcctl files sample --data '{"path":"config"}'
  mcctl apply-properties sample --data '{"values":{"difficulty":"hard"}}' --confirm
  mcctl reset-world sample --data '{"sameSeed":true}' --confirm --confirm-name sample
  mcctl create-server --data '{"name":"sample","version":"1.21.1","memory":2048}'

Memory is MiB. A port is picked automatically when omitted. Schedule times use
UTC HH:MM. Destructive actions require --confirm; world/reset/restore/delete
also require --confirm-name. Server data paths are relative to its data folder.
Secret credentials and deployment addresses are read from the private environment.
`;
const argv = process.argv.slice(2);
if (!argv.length || ["help", "--help", "-h"].includes(argv[0])) {
  console.log(help);
  process.exit(0);
}
const verb = argv.shift()!;
const name = argv[0] && !argv[0].startsWith("--") ? argv.shift() : undefined;
const flags: Record<string, string | boolean> = {};
try {
  while (argv.length) {
    const key = argv.shift()!;
    if (
      ![
        "--json",
        "--confirm",
        "--confirm-name",
        "--data",
        "--data-file",
        "--out",
        "--file",
        "--path",
        "--snapshot",
      ].includes(key)
    )
      throw Error("Unknown option " + key);
    if (["--json", "--confirm"].includes(key)) flags[key] = true;
    else {
      const value = argv.shift();
      if (!value || value.startsWith("--"))
        throw Error("Missing value for " + key);
      flags[key] = value;
    }
  }
  const socketPath = process.env.MC_HELPER_SOCKET,
    secretFile = process.env.MC_HELPER_SECRET_FILE;
  if (!socketPath || !secretFile)
    throw Error(
      "Set MC_HELPER_SOCKET and MC_HELPER_SECRET_FILE (fleet mcctl wrapper does this)",
    );
  const secret = (await readFile(secretFile, "utf8")).trim();
  const payload: Record<string, unknown> = flags["--data-file"]
    ? JSON.parse(await readFile(String(flags["--data-file"]), "utf8"))
    : flags["--data"]
      ? JSON.parse(String(flags["--data"]))
      : {};
  if (flags["--confirm"]) payload.confirm = true;
  if (flags["--confirm-name"]) payload.confirmName = flags["--confirm-name"];
  const destructive = new Set([
    "kill",
    "apply-properties",
    "set-loader",
    "write-file",
    "delete-file",
    "restore-backup",
    "reset-world",
    "delete-server",
    "upload-world",
    "upload-file",
    "upload-icon",
  ]);
  if (destructive.has(verb) && !flags["--confirm"])
    throw Error("This action requires --confirm");
  if (
    ["reset-world", "restore-backup", "delete-server", "upload-world"].includes(
      verb,
    ) &&
    flags["--confirm-name"] !== name
  )
    throw Error("This action requires --confirm-name " + name);
  const binary = verb.startsWith("download-") || verb.startsWith("upload-");
  let path = "/",
    method = "POST";
  let body: string | undefined;
  if (binary) {
    const query = new URLSearchParams({ verb, name: name || "" });
    for (const flag of ["--path", "--snapshot", "--confirm", "--confirm-name"])
      if (flags[flag])
        query.set(
          flag === "--confirm-name" ? "confirmName" : flag.slice(2),
          String(flags[flag]),
        );
    path =
      (verb.startsWith("download-") ? "/download" : "/upload") + "?" + query;
    method = verb.startsWith("download-") ? "GET" : "POST";
    if (method === "GET" && !flags["--out"]) throw Error("Choose --out FILE");
    if (method === "POST" && !flags["--file"])
      throw Error("Choose --file FILE");
  } else body = JSON.stringify({ verb, name, payload });
  await new Promise<void>((resolve, reject) => {
    const req = request(
      {
        socketPath,
        path,
        method,
        headers: {
          Authorization: "Bearer " + secret,
          "Content-Type": binary
            ? "application/octet-stream"
            : "application/json",
          ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
        },
      },
      async (res) => {
        try {
          if ((res.statusCode ?? 500) >= 400) {
            let text = "";
            for await (const chunk of res) text += chunk;
            let message = "Request failed (" + res.statusCode + ")";
            try {
              message = JSON.parse(text).error || message;
            } catch {
              /* Do not echo unexpected raw error bodies. */
            }
            throw Error(message);
          }
          if (verb.startsWith("download-")) {
            await pipeline(
              res,
              createWriteStream(String(flags["--out"]), {
                flags: "wx",
                mode: 0o600,
              }),
            );
            if (flags["--json"])
              console.log(
                JSON.stringify({ downloaded: String(flags["--out"]) }),
              );
            else console.log("Saved " + String(flags["--out"]));
            resolve();
            return;
          }
          let text = "";
          for await (const chunk of res) text += chunk;
          const value = JSON.parse(text);
          console.log(JSON.stringify(value, null, flags["--json"] ? 0 : 2));
          resolve();
        } catch (e) {
          reject(e);
        }
      },
    );
    req.setTimeout(1_200_000, () => req.destroy(Error("Operation timed out")));
    req.on("error", reject);
    if (verb.startsWith("upload-"))
      createReadStream(String(flags["--file"]))
        .on("error", (e) => req.destroy(e))
        .pipe(req);
    else req.end(body);
  });
} catch (e) {
  const message = e instanceof Error ? e.message : "Operation failed";
  if (flags["--json"]) console.error(JSON.stringify({ error: message }));
  else console.error("mcctl: " + message);
  process.exitCode = 1;
}
