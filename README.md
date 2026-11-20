# mc

A small self-hosted Fabric Minecraft manager. React and Hono, with a shared
[UI shell](https://github.com/zsrobinson/shell) pinned by commit. MIT licensed.
The web container has no Docker socket. A separate host helper accepts only
fixed authenticated operations and manages containers carrying its labels.

## Deployment

Build the panel image with `docker build -t mc-panel .`. Run `helper.py` as an
unprivileged systemd user service on the rootless Docker host. The helper uses
UID 0 **inside rootless containers**, mapping to the unprivileged host user.
Rootful Docker is unsupported. Do not expose the helper listener publicly.

Supply these helper environment variables: `MC_ROOT`, `MC_BACKUP_ROOT`,
`MC_PORT_MIN`, `MC_PORT_MAX`, `MC_MEMORY_BUDGET_MIB`, `MC_MAX_SERVERS`,
`MC_CPUS`, `MC_HELPER_PORT`, `MC_HELPER_SECRET_FILE`, `MC_BACKUP_TARGETS`.
Backup targets are JSON `[{"host":"backup-host","path":"backups/minecraft"}]`.
SSH must use pinned host keys and noninteractive authentication. Each config
stores name, version, memory in MiB, port, mods, datapacks and javaTag.
Container limits include an additional 512 MiB per world; the sum is enforced.
Do not manually edit live configs while the helper is active.

Supply panel variables: `ACCESS_ISSUER`, `ACCESS_AUD`, `PUBLIC_ORIGIN`, `PORT`,
`HELPER_SOCKET`, `HELPER_SECRET_FILE`, `SERVICE_MANIFEST`. Mount the helper secret
read-only; never mount the Docker socket. The helper binds loopback and optionally a Unix socket (`MC_HELPER_SOCKET`).
Mount the socket directory into the panel. Set `BIND_ADDRESS` inside the container
and publish the panel port on host loopback for the tunnel connector.
The Access issuer must be your team's HTTPS origin. JWT signatures, audience,
issuer and expiry are checked on every request, including assets. Mutations
also check the exact browser Origin. Run behind an Access-protected reverse proxy.

The runtime manifest is an array of `{name,url,icon?,colour?}`. Treat it as trusted
configuration; keep deployment-specific hosts and identity out of this repository.
The shell prefetches switcher destinations and caches hashed assets for a year.

## Operations

POST `{verb,name?,payload?}` to the helper with the shared Bearer secret. Supported
verbs: list, status, versions, limits, start, stop, restart, logs, rcon,
apply-config, check-upgrade, check-updates, backup-now, create-server,
upload-datapack. Logs are polled while the console is open. RCON is never
published. Only the game TCP port is published; no UDP support is enabled.
Server-side Modrinth projects are validated for vanilla-client compatibility.
Upgrade checks include all configured mods and datapacks, resolve the official
Java requirement, and refuse changes until both backup destinations verify.
Mod updates are fetched by itzg on recreation. Version support depends on
published Fabric, image and Modrinth builds. Alpha optimization mods are permitted;
operators should review their compatibility before adding them.

Backups save-off/save-all-flush/save-on in a finally block, archive the server and
config, then verify SHA-256 before atomic publication on each destination.
Schedule backup-now through the helper to serialize it with config changes.
Retention is 14 daily snapshots plus the newest snapshot from eight ISO weeks.
Only snapshots created by this application are eligible for pruning.
DNS remains an operator task; create-server does not receive DNS credentials.
For restore, stop the managed container, verify archive checksums, extract into a
new private staging directory, then restore its data/config/secret together.
Never extract untrusted archives over a live world. Keep the replaced data until
its deletion is explicitly approved.

## Panel

The panel is a Vite app in `panel/` built on the shared shell, with TanStack
Router file routes and TanStack Query for every request.

| Route                     | Page                                                                             |
| ------------------------- | -------------------------------------------------------------------------------- |
| `/`                       | Servers with join addresses, players and status                                  |
| `/new`                    | Create a server from a name; advanced options are optional                       |
| `/servers/$name`          | Overview: status, performance, players, connection                               |
| `/servers/$name/console`  | Live log with reconnect, RCON commands with history, log files                   |
| `/servers/$name/players`  | Online players, whitelist, operators and bans                                    |
| `/servers/$name/mods`     | Installed mods and datapacks, updates, Modrinth search                           |
| `/servers/$name/files`    | Data directory browser, text editor, upload, download                            |
| `/servers/$name/world`    | Download, replace or reset the world                                             |
| `/servers/$name/backups`  | Snapshots, back up now, restore test, restore, download                          |
| `/servers/$name/software` | Minecraft upgrade with compatibility check, Fabric loader                        |
| `/servers/$name/settings` | Game settings, server.properties, resources, schedule, DNS, icon, rename, delete |

Dialogs only confirm short actions. Restoring, replacing or resetting a world,
renaming and deleting a server require typing the server's name. The console
follows `/api/console` server-sent events and falls back to polling `logs`.

`panel/src/lib` holds the API client (`api.ts`), query and mutation hooks
(`queries.ts`, `mutations.ts`) and formatting; `panel/src/components` holds page
sections grouped by area. Scripts: `npm run dev` (with `API_PORT` pointing at
a local API), `npm run typecheck`, `npm run lint`, `npm run format:check`,
`npm run build`.

## Development

Node 24, Python 3.11+. `npm ci && npm run build`, then
`python3 -m unittest discover -s tests -v`. The Vite API proxy uses `API_PORT`.
There is no authentication bypass in the production server.

## Updating the shared shell

Run `npm run shell:update` to pin the latest shell main commit and refresh the
lockfile. Review both files, run `npm run typecheck`, `npm run lint`,
`npm run format:check`, `npm run build` and the backend checks from CI, then
commit and deploy. Shared blocks and the Access/session/static/observability
server boundary live in shell; keep only Minecraft behavior in this app.

## Dashboard history

Configure `PROMETHEUS_URL` in the panel environment. The authenticated
`GET /api/history?range=24h&server=phelix` endpoint accepts only 1h, 24h, 7d,
and 30d, and an optional server validated against the helper's server list.
It runs fixed named queries for server status, players, MSPT, CPU, memory and
limits, backup success timestamps, and panel request/error rates. Steps are
30 seconds, 5 minutes, 30 minutes, and 2 hours respectively, with a 15-second
cache and an 8-second upstream timeout. Clients cannot submit PromQL.

The Dashboard is the default landing page. Server colors remain stable across
pages. Missing samples stay empty; current values remain in the Overview.
Peak players today is the highest sampled combined player count since midnight
UTC. Backup size history uses actual snapshot metadata because the exporter
does not publish snapshot sizes. Retention belongs to the Prometheus deployment;
longer ranges fill as samples accumulate. No infrastructure URL is compiled into
the client or included in this repository.
