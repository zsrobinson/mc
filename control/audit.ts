import { appendFile, mkdir, readFile, rename, stat, chmod } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { exists } from "./config";

/**
 * Append-only activity log of panel, CLI and automated mutations. Entries carry
 * time, actor, verb, server, outcome, duration and a short metadata detail.
 * Command text, chat, file contents and secrets are never recorded.
 */
export type AuditEntry = {
  id: string;
  at: string;
  actor: string;
  verb: string;
  server?: string;
  outcome: "ok" | "error";
  durationMs: number;
  detail?: string;
  error?: string;
};
const MAX_BYTES = 5 * 1024 * 1024;
export const actorSchema = z
  .string()
  .max(254)
  .regex(/^[A-Za-z0-9._%+@-]+$/, "Invalid actor");

/** Verbs that change nothing; they are never recorded. */
export const readVerbs = new Set([
  "list",
  "status",
  "versions",
  "limits",
  "logs",
  "backups",
  "players",
  "properties",
  "files",
  "read-file",
  "read-log",
  "logs-list",
  "dns-status",
  "check-upgrade",
  "check-updates",
  "create-progress",
  "mods-details",
  "loader-versions",
  "world-info",
  "tasks",
  "audit",
  "confirm-intent",
]);

const clip = (value: unknown, length = 120) =>
  typeof value === "string"
    ? value.replace(/[\r\n\t]+/g, " ").slice(0, length)
    : undefined;

/** A short, metadata-only description of a request. Never includes free text. */
export function auditDetail(verb: string, payload: unknown): string | undefined {
  const p =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const parts: string[] = [];
  if (verb === "player-action") {
    // Player names are operational metadata (whitelist/ban targets), not chat.
    if (typeof p.action === "string") parts.push(p.action);
    if (typeof p.player === "string" && /^[A-Za-z0-9_.:]{1,45}$/.test(p.player))
      parts.push(p.player);
  }
  for (const key of ["path", "from", "to", "destination", "snapshot", "version", "loader", "newName", "file"])
    if (typeof p[key] === "string") parts.push(key + ": " + clip(p[key]));
  if (Array.isArray(p.paths)) parts.push(p.paths.length + " paths");
  if (verb === "apply-properties") {
    if (p.values && typeof p.values === "object")
      parts.push("changed: " + Object.keys(p.values).slice(0, 12).join(", "));
    if (typeof p.raw === "string") parts.push("raw editor");
  }
  if (verb === "apply-config")
    parts.push("changed: " + Object.keys(p).slice(0, 12).join(", "));
  if (verb === "save-task" && p.task && typeof p.task === "object") {
    const t = p.task as Record<string, unknown>;
    parts.push(
      [t.kind, t.time, t.enabled === false ? "disabled" : ""]
        .filter((x) => typeof x === "string" && x)
        .join(" "),
    );
  }
  if (["delete-task", "run-task"].includes(verb) && typeof p.id === "string")
    parts.push("task " + clip(p.id, 40));
  if (verb === "backup-now" && typeof p.reason === "string") parts.push(p.reason);
  if (verb === "create-server" && typeof p.name === "string")
    parts.push("name: " + clip(p.name, 40));
  const detail = parts.filter(Boolean).join(" · ");
  return detail || undefined;
}

export class Audit {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(readonly file: string) {}
  record(entry: Omit<AuditEntry, "id" | "at"> & { at?: string }) {
    const full: AuditEntry = {
      id: randomUUID(),
      at: entry.at ?? new Date().toISOString(),
      ...entry,
      error: clip(entry.error, 200),
      detail: clip(entry.detail, 240),
    };
    const write = this.tail.then(async () => {
      await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
      if ((await exists(this.file)) && (await stat(this.file)).size > MAX_BYTES)
        await rename(this.file, this.file + ".1");
      await appendFile(this.file, JSON.stringify(full) + "\n", { mode: 0o600 });
      await chmod(this.file, 0o600);
    });
    this.tail = write.catch(() => console.error("Audit write failed"));
    return write.then(() => full);
  }
  async list(input: { server?: string; limit?: number; before?: string }) {
    const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
    const entries: AuditEntry[] = [];
    for (const file of [this.file, this.file + ".1"]) {
      if (!(await exists(file))) continue;
      const lines = (await readFile(file, "utf8")).split("\n").filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          entries.push(JSON.parse(lines[i]));
        } catch {
          /* Skip a torn final line. */
        }
      }
    }
    const matching = entries.filter(
      (e) =>
        (!input.server || e.server === input.server) &&
        (!input.before || e.at < input.before),
    );
    return { entries: matching.slice(0, limit), more: matching.length > limit };
  }
}

export const destructiveActions = [
  "delete-server",
  "reset-world",
  "restore-backup",
  "replace-world",
  "kill",
] as const;
export type DestructiveAction = (typeof destructiveActions)[number];

/**
 * Single-use, server-bound, short-lived confirmation tokens. A destructive verb
 * needs a token minted by a separate request, the typed server name and
 * confirm:true, so no single replayed or stray request can destroy data.
 */
export class Intents {
  private tokens = new Map<
    string,
    { action: DestructiveAction; server: string; expires: number }
  >();
  constructor(private ttl = 5 * 60 * 1000) {}
  issue(action: DestructiveAction, server: string) {
    const now = Date.now();
    for (const [key, value] of this.tokens)
      if (value.expires <= now) this.tokens.delete(key);
    const token = randomBytes(24).toString("base64url");
    this.tokens.set(token, { action, server, expires: now + this.ttl });
    return { token, action, expiresAt: new Date(now + this.ttl).toISOString() };
  }
  consume(action: DestructiveAction, server: string, token: unknown) {
    if (typeof token !== "string" || !token) throw new IntentError();
    for (const [key, value] of this.tokens) {
      const a = Buffer.from(key),
        b = Buffer.from(token);
      if (a.length === b.length && timingSafeEqual(a, b)) {
        this.tokens.delete(key);
        if (
          value.action !== action ||
          value.server !== server ||
          value.expires <= Date.now()
        )
          throw new IntentError();
        return;
      }
    }
    throw new IntentError();
  }
}
export class IntentError extends Error {
  readonly code = "intent-required";
  constructor() {
    super(
      "Confirmation expired or missing. Start the action again from its confirmation page.",
    );
  }
}
export const auditFile = (root: string) => join(root, "audit.jsonl");
