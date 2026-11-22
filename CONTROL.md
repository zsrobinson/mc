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

Backups issue save-off/save-all flush, archive data and configuration without RCON credentials, and always
attempt save-on in finally. Copies are staged over SSH, checked with SHA-256 and
atomically published. Failure prevents config changes. Retention selects only
owned completed snapshot identifiers and retains snapshots from 14 distinct days, eight ISO weeks and 12 months. Restore into a private staging directory
while the server is stopped; verify checksums and preserve the replaced world.
DNS is an operator task; the helper has no DNS credentials.

Validation: `npx tsc -p tsconfig.control.json` and
`node --import tsx --test tests/*.test.ts`. Tests exercise signed Access JWTs,
Origin checks, the Unix boundary, ownership, resources, unsafe upgrades, failed
replication, save-on recovery, ZIP paths and retention.

Management includes real Docker resource metrics, tick-time queries where supported,
player/whitelist/operator/ban controls, protected properties, data-scoped files,
world ZIP transfers/reset, verified backup restore, schedules and retained server
deletion. Destructive verbs require explicit confirmation; world replacement,
reset, restore and server deletion also require the exact server name. Game ports
are reserved after deletion while old DNS records remain. An optional scoped
DNS integration creates only the configured per-server SRV name. It never deletes
DNS records.

`cli.ts` supplies mcctl help, JSON output, same-API operations and streamed
file/world/backup transfers. Deployment installs the private environment wrapper.
Archive directories/files use 0700/0600; RCON is excluded and reinjected with a
fresh secret on restore. Pre-upgrade/destructive snapshots are pinned separately
for 90 days, and at least the latest three pinned snapshots remain. A scratch
restore-test checks SHA-256, loads level.dat and verifies region files without
changing the live server.

Optional MC_LOKI_URL and MC_PROMETHEUS_OTLP_URL export only projected metadata
and numeric metrics. They never export chat, commands, player names, raw logs or
file contents. MC_OBS_HOST labels the host; MC_OBS_HEALTH_FILE contains only a
timestamp and pass/fail for an existing host heartbeat. The deployment owns
Grafana dashboard/alert provisioning and its Healthchecks integration.

## Activity log, confirmations and tasks

Every mutating request is appended to `audit.jsonl` beside the server folders
(0600, rotated at 5 MiB): time, actor, verb, server, outcome, duration and a
metadata-only detail such as a file path or snapshot id. Read verbs are not
recorded. Command text, chat, file contents and secrets never are. The panel
passes the signed-in email as `actor`; `mcctl` uses `cli`, tasks `schedule`,
and the crash monitor `monitor`. Read it with the `audit` verb.

Deleting a server, resetting or replacing a world, restoring a snapshot and
killing a server need `confirm: true`, the exact `confirmName` and a single-use
`intent` token from `confirm-intent` (bound to action and server, five-minute
expiry). A missing or reused token returns 409 `intent-required`, so no single
replayed or stray request can destroy data. `mcctl` fetches the token itself.

Per-server tasks (`tasks`, `save-task`, `delete-task`, `run-task`) replace the
two fixed daily times: restart (with 1–15 minute in-game countdown), backup,
console command or announcement, at a UTC time on chosen weekdays. Legacy
`schedule` settings migrate once. The scheduler also records unexpected exits
and restart-policy restarts as `crash-detected`; status reports `lastExit`.

Files support `make-directory`, `rename-file`, `archive-files` and
`extract-archive` within the data folder. World, `server.properties` and the
icon stay with their dedicated actions. Extraction refuses absolute or `..`
paths, symlink entries, secret-named files, any overwrite, more than 20,000
entries and more than 2 GiB expanded. `read-log` returns the last 1 MiB of a
log (gzip decompressed, ANSI stripped).
