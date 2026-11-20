# Control helper

The helper is TypeScript and Hono on Node 24, listening on a private Unix socket.
It alone uses rootless Docker. The panel receives the helper socket and shared
secret, with no Docker socket. Run `node --import tsx helper.ts` in the installed
repository with its locked dependencies. The process refuses rootful Docker.

Modules are intentionally small: `control/config.ts` validates configs and the
shared resource budget; `upstream.ts` checks official releases, Java and
Modrinth compatibility; `docker.ts` implements only fixed container operations;
`backups.ts` archives and verifies replicas; `service.ts` serializes operations.
`helper.ts` authenticates and validates HTTP requests.

Required configuration: MC_ROOT, MC_BACKUP_ROOT, MC_PORT_MIN, MC_PORT_MAX,
MC_MEMORY_BUDGET_MIB, MC_MAX_SERVERS, MC_CPUS, MC_HELPER_SOCKET,
MC_HELPER_SECRET_FILE and MC_BACKUP_TARGETS. Targets are JSON entries with host
and path. At least two destinations are required. SSH uses pinned host keys
and batch authentication. Credentials stay on the host. Optional MC_JOIN_DOMAIN
and MC_DIRECT_HOST provide join and host:port addresses to authenticated clients.
No deployment domains, addresses, ranges or world names are built into the code.

POST authenticated JSON `{verb,name?,payload?}` to `/`. Verbs are list, status,
versions, limits, start, stop, restart, logs, rcon, apply-config, backup-now,
backups, create-server, check-upgrade, check-updates and upload-datapack.
Every container action checks managed labels and the exact data mount. Config
patches reject unknown keys. Memory is MiB; 512 MiB overhead per container counts
against the total budget. Only game TCP is published; RCON remains private.

Apply-config checks every configured mod/datapack and Java image, refuses
downgrades, verifies both backup destinations, writes config atomically and
recreates only that server. Project mods must permit vanilla clients. Uploaded
ZIPs are size/path checked without extraction. Existing files are preserved.
Removed downloaded datapacks are deleted only after their ownership hash matches.

Backups issue save-off/save-all flush, archive data/config/secret, and always
attempt save-on in finally. Copies are staged over SSH, checked with SHA-256 and
atomically published. Failure prevents config changes. Retention selects only
owned completed snapshot identifiers and retains 14 recent snapshots plus the
newest snapshot in eight ISO weeks. Restore into a private staging directory
while the server is stopped; verify checksums and preserve the replaced world.
DNS is an operator task; the helper has no DNS credentials.

Validation: `npx tsc -p tsconfig.control.json` and
`node --import tsx --test tests/*.test.ts`. Tests exercise signed Access JWTs,
Origin checks, the Unix boundary, ownership, resources, unsafe upgrades, failed
replication, save-on recovery, ZIP paths and retention.
