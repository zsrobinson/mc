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

## Development

Node 24, Python 3.11+. `npm ci && npm run build`, then
`python3 -m unittest discover -s tests -v`. The Vite API proxy uses `API_PORT`.
There is no authentication bypass in the production server.
