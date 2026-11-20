import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { AppShell, type Service } from "@zsrobinson/shell";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@zsrobinson/shell/ui/dialog";
import { Input } from "@zsrobinson/shell/ui/input";
import { Label } from "@zsrobinson/shell/ui/label";
import { Badge } from "@zsrobinson/shell/ui/badge";
import {
  Plus,
  ArrowUpRight,
  Terminal,
  Package,
  Archive,
  Play,
  Square,
  RotateCw,
  Search,
  ArrowUp,
  Loader2,
} from "lucide-react";
import "@zsrobinson/shell/styles.css";
import "./style.css";
type Server = {
  name: string;
  state: string;
  players: string | null;
  version: string;
  javaTag: string;
  memory: number;
  port: number;
  mods: string[];
  datapacks: string[];
  backup?: { at: string };
};
type Check = {
  version: string;
  javaTag: string;
  projects: { project: string; compatible: boolean; version: string | null }[];
};
async function control(verb: string, name?: string, payload: unknown = {}) {
  const r = await fetch("/api/control", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ verb, name, payload }),
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Request failed");
  return d;
}
function App() {
  const consoleRef = useRef<HTMLPreElement>(null);

  const [servers, setServers] = useState<Server[] | null>(null),
    [session, setSession] = useState<{ email: string; services: Service[] }>(),
    [selected, setSelected] = useState<string>(),
    [dialog, setDialog] = useState<string>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [logs, setLogs] = useState(""),
    [command, setCommand] = useState(""),
    [query, setQuery] = useState(""),
    [hits, setHits] = useState<
      { slug: string; title: string; description: string }[]
    >([]),
    [kind, setKind] = useState<"mods" | "datapacks">("mods"),
    [version, setVersion] = useState(""),
    [versions, setVersions] = useState<string[]>([]),
    [check, setCheck] = useState<Check>(),
    [newName, setNewName] = useState(""),
    [memory, setMemory] = useState("2048"),
    [port, setPort] = useState(""),
    [limits, setLimits] = useState<Record<string, string>>({});
  const current = servers?.find((s) => s.name === selected);
  useEffect(() => {
    const el = consoleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);
  const refresh = () => control("list").then(setServers);
  useEffect(() => {
    fetch("/api/session")
      .then((r) => {
        if (!r.ok) throw Error("Sign in through Cloudflare Access");
        return r.json();
      })
      .then(setSession)
      .catch((e) => setError(e.message));
    refresh().catch((e) => setError(e.message));
    control("versions")
      .then(setVersions)
      .catch(() => {});
    control("limits")
      .then(setLimits)
      .catch(() => {});
    const t = setInterval(() => {
      refresh().catch(() => {});
    }, 15000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (dialog !== "console" || !selected) return;
    let live = true;
    const poll = () =>
      control("logs", selected)
        .then((d) => {
          if (live) setLogs(d.text);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    poll();
    const t = setInterval(poll, 2500);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [dialog, selected]);
  async function act(fn: () => Promise<unknown>, success = "Done") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await refresh();
      setMessage(success);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function open(s: Server, type: string) {
    setSelected(s.name);
    setDialog(type);
    setCheck(undefined);
    setVersion(s.version);
    setError("");
    setMessage("");
    setHits([]);
  }
  const versionSelect = (
    <select
      aria-label="Minecraft version"
      value={version}
      onChange={(e) => {
        setVersion(e.target.value);
        setCheck(undefined);
      }}
    >
      {versions
        .filter(
          (v, i) =>
            dialog !== "upgrade" ||
            !current ||
            versions.indexOf(current.version) < 0 ||
            i <= versions.indexOf(current.version),
        )
        .map((v) => (
          <option key={v}>{v}</option>
        ))}
    </select>
  );
  return (
    <AppShell
      name="Minecraft"
      email={session?.email}
      services={session?.services || []}
    >
      <div className="page-heading">
        <div>
          <h1>Your servers</h1>
          <p>Worlds, ready when you are.</p>
        </div>
        <Button
          onClick={() => {
            setDialog("create");
            setVersion(versions[0] || "");
            setPort(String(limits.MC_PORT_MIN || ""));
            setError("");
            setMessage("");
          }}
        >
          <Plus />
          New server
        </Button>
      </div>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="notice" role="status">
          {message}
        </div>
      )}
      <section className="server-list" aria-label="Servers">
        {servers === null ? (
          [1, 2].map((i) => <div className="skeleton" key={i} />)
        ) : servers.length === 0 ? (
          <div className="empty">
            <Package size={28} />
            <h2>A place for your next world</h2>
            <p>Create a server to get started.</p>
          </div>
        ) : (
          servers.map((s) => (
            <article key={s.name} className="server-row">
              <div className="server-heading">
                <div className="server-icon">
                  <Package size={24} />
                </div>
                <div>
                  <button
                    className="server-name"
                    onClick={() => open(s, "console")}
                  >
                    {s.name}
                    <ArrowUpRight size={16} />
                  </button>
                  <div className="server-meta">
                    Fabric {s.version}
                    <span>·</span>
                    {(s.memory / 1024).toFixed(1)} GiB heap<span>·</span>Port{" "}
                    {s.port}
                  </div>
                </div>
                <Badge variant="secondary" className="state">
                  <span
                    className={"dot " + (s.state === "running" ? "online" : "")}
                  />
                  {s.state === "running" ? "Online" : s.state}
                </Badge>
              </div>
              <div className="server-detail">
                <span>{s.players || "Player count unavailable"}</span>
                <span>
                  {s.mods.length} mods · {s.datapacks.length} datapacks
                </span>
              </div>
              <div className="server-actions">
                <div className="action-group">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => open(s, "console")}
                  >
                    <Terminal />
                    Console
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => open(s, "mods")}
                  >
                    <Package />
                    Mods & packs
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => open(s, "upgrade")}
                  >
                    <ArrowUp />
                    Upgrade
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => open(s, "backup")}
                  >
                    <Archive />
                    Back up
                  </Button>
                </div>
                <div className="action-group">
                  <Button
                    aria-label={"Start " + s.name}
                    disabled={busy || s.state === "running"}
                    size="icon-sm"
                    variant="ghost"
                    onClick={() =>
                      act(() => control("start", s.name), "Server started")
                    }
                  >
                    <Play />
                  </Button>
                  <Button
                    aria-label={"Restart " + s.name}
                    disabled={busy}
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => open(s, "restart")}
                  >
                    <RotateCw />
                  </Button>
                  <Button
                    aria-label={"Stop " + s.name}
                    disabled={busy || s.state !== "running"}
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => open(s, "stop")}
                  >
                    <Square />
                  </Button>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
      <p className="footnote">
        Backups protect every change. Vanilla clients welcome.
      </p>
      <Dialog
        open={!!dialog}
        onOpenChange={(v) => {
          if (!busy && !v) setDialog(undefined);
        }}
      >
        <DialogContent className={dialog === "console" ? "console-dialog" : ""}>
          <DialogHeader>
            <DialogTitle>
              {dialog === "create"
                ? "Create a server"
                : dialog === "console"
                  ? current?.name + " console"
                  : dialog === "mods"
                    ? "Mods & datapacks"
                    : dialog === "upgrade"
                      ? "Upgrade Minecraft"
                      : dialog === "backup"
                        ? "Back up " + current?.name
                        : dialog === "stop"
                          ? "Stop " + current?.name
                          : dialog === "restart"
                            ? "Restart " + current?.name
                            : ""}
            </DialogTitle>
            <DialogDescription>
              {dialog === "console"
                ? "Live server output. Commands run through private RCON."
                : dialog === "mods"
                  ? "Server-side additions that keep vanilla clients welcome."
                  : dialog === "upgrade"
                    ? "Check compatibility, then back up before changing versions."
                    : dialog === "create"
                      ? "Choose a name and resources for a new Fabric world."
                      : "This operation applies to this server only."}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="notice" role="status">
              {message}
            </div>
          )}
          {dialog === "console" && (
            <>
              <pre ref={consoleRef} className="console" tabIndex={0}>
                {logs || "Waiting for server output…"}
              </pre>
              <form
                className="command"
                onSubmit={(e) => {
                  e.preventDefault();
                  act(async () => {
                    const d = await control("rcon", selected, { command });
                    setLogs((l) => l + "\n> " + command + "\n" + d.text);
                    setCommand("");
                  }, "Command sent");
                }}
              >
                <Input
                  aria-label="Console command"
                  placeholder="Enter a command, e.g. list"
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                />
                <Button disabled={busy || !command}>Send</Button>
              </form>
            </>
          )}
          {dialog === "mods" && current && (
            <>
              <div className="tabs">
                <Button
                  variant={kind === "mods" ? "secondary" : "ghost"}
                  onClick={() => {
                    setKind("mods");
                    setHits([]);
                  }}
                >
                  Mods
                </Button>
                <Button
                  variant={kind === "datapacks" ? "secondary" : "ghost"}
                  onClick={() => {
                    setKind("datapacks");
                    setHits([]);
                  }}
                >
                  Datapacks
                </Button>
              </div>
              <div className="installed">
                {current[kind].length ? (
                  current[kind].map((p) => (
                    <div className="project" key={p}>
                      <div>
                        <strong>{p}</strong>
                        <p>Installed · {current.version}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          act(
                            () =>
                              control("apply-config", selected, {
                                [kind]: current[kind].filter((x) => x !== p),
                              }),
                            "Removed and restarted",
                          )
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="muted">No {kind} installed.</p>
                )}
              </div>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  act(
                    async () =>
                      setCheck(await control("check-updates", selected)),
                    "Available project versions checked",
                  )
                }
              >
                Check for mod updates
              </Button>
              {check && (
                <div className="check-results">
                  {check.projects.map((p) => (
                    <p key={p.project}>
                      {p.project}: {p.version || "No compatible build"}
                    </p>
                  ))}
                  <Button
                    disabled={busy}
                    onClick={() =>
                      act(
                        () => control("apply-config", selected, {}),
                        "Projects refreshed and server restarted",
                      )
                    }
                  >
                    Back up & apply updates
                  </Button>
                </div>
              )}
              <form
                className="command"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setError("");
                  try {
                    const r = await fetch(
                      "/api/search?q=" +
                        encodeURIComponent(query) +
                        "&kind=" +
                        (kind === "mods" ? "mod" : "datapack"),
                    );
                    setHits((await r.json()).hits);
                  } catch {
                    setError("Search failed");
                  }
                }}
              >
                <Input
                  aria-label="Search Modrinth"
                  placeholder="Search Modrinth…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <Button variant="outline" aria-label="Search">
                  <Search />
                </Button>
              </form>
              <div className="search-results">
                {hits.map((h) => (
                  <div className="project" key={h.slug}>
                    <div>
                      <strong>{h.title}</strong>
                      <p>{h.description}</p>
                    </div>
                    <Button
                      size="sm"
                      disabled={busy || current[kind].includes(h.slug)}
                      onClick={() =>
                        act(
                          () =>
                            control("apply-config", selected, {
                              [kind]: [...current[kind], h.slug],
                            }),
                          "Added and restarted",
                        )
                      }
                    >
                      Add
                    </Button>
                  </div>
                ))}
              </div>
              {kind === "datapacks" && (
                <div>
                  <Label htmlFor="pack-upload">
                    Upload a datapack ZIP (up to 16 MiB)
                  </Label>
                  <Input
                    id="pack-upload"
                    type="file"
                    accept=".zip"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      if (f.size > 16 * 1024 * 1024) {
                        setError("File exceeds 16 MiB");
                        return;
                      }
                      act(async () => {
                        const b = await f.arrayBuffer();
                        let s = "";
                        for (const n of new Uint8Array(b))
                          s += String.fromCharCode(n);
                        return control("upload-datapack", selected, {
                          filename: f.name,
                          data: btoa(s),
                        });
                      }, "Datapack uploaded. Reload or restart to enable.");
                    }}
                  />
                </div>
              )}
            </>
          )}
          {dialog === "upgrade" && current && (
            <>
              <div className="upgrade-current">
                <span>Current version</span>
                <strong>
                  {current.version} · {current.javaTag}
                </strong>
              </div>
              <Label>Upgrade to</Label>
              {versionSelect}
              <Button
                variant="outline"
                disabled={busy || !version}
                onClick={() =>
                  act(
                    async () =>
                      setCheck(
                        await control("check-upgrade", selected, { version }),
                      ),
                    "Compatibility checked",
                  )
                }
              >
                Check compatibility
              </Button>
              {check && (
                <div className="check-results">
                  <strong>
                    {check.projects.every((p) => p.compatible)
                      ? "Ready to upgrade"
                      : "Upgrade blocked"}
                  </strong>
                  {check.projects.length === 0 && (
                    <p>No installed mods or datapacks to check.</p>
                  )}
                  {check.projects.map((p) => (
                    <p key={p.project}>
                      {p.compatible ? "✓" : "×"} {p.project} —{" "}
                      {p.version || "No build for " + version}
                    </p>
                  ))}
                  <p>
                    Java image: {check.javaTag}. A verified NAS and secondary
                    backup must complete first.
                  </p>
                </div>
              )}
              <Button
                disabled={
                  busy ||
                  !check ||
                  !check.projects.every((p) => p.compatible) ||
                  version === current.version
                }
                onClick={() =>
                  act(
                    () => control("apply-config", selected, { version }),
                    "Upgrade started",
                  )
                }
              >
                Back up & upgrade to {version}
              </Button>
            </>
          )}
          {dialog === "create" && (
            <form
              className="create-form"
              onSubmit={(e) => {
                e.preventDefault();
                act(async () => {
                  await control("create-server", undefined, {
                    name: newName,
                    version,
                    memory: Number(memory),
                    port: Number(port),
                  });
                  setDialog(undefined);
                }, "Server created. An operator can configure its DNS record.");
              }}
            >
              <Label htmlFor="name">Server name</Label>
              <Input
                id="name"
                placeholder="A short lowercase name"
                pattern="[a-z][a-z0-9]{0,23}"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Label>Minecraft version</Label>
              {versionSelect}
              <div className="form-columns">
                <div>
                  <Label htmlFor="memory">Heap memory (MiB)</Label>
                  <Input
                    id="memory"
                    type="number"
                    min="512"
                    step="256"
                    required
                    value={memory}
                    onChange={(e) => setMemory(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="port">Game port</Label>
                  <Input
                    id="port"
                    type="number"
                    min={limits.MC_PORT_MIN}
                    max={limits.MC_PORT_MAX}
                    required
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                  />
                </div>
              </div>
              <p className="muted">
                Resources are checked against the shared host budget before
                creation.
              </p>
              <Button disabled={busy}>Create server</Button>
            </form>
          )}
          {["stop", "restart", "backup"].includes(dialog || "") && (
            <>
              <p className="muted">
                {dialog === "backup"
                  ? "Save the world and verify a snapshot on both configured backup destinations."
                  : "Connected players will be disconnected. The world is saved before shutdown."}
              </p>
              <Button
                variant={dialog === "stop" ? "destructive" : "default"}
                disabled={busy}
                onClick={() =>
                  act(
                    () =>
                      control(
                        dialog === "backup" ? "backup-now" : dialog!,
                        selected,
                      ),
                    dialog === "backup"
                      ? "Backup verified on both destinations"
                      : "Server " + dialog + " complete",
                  )
                }
              >
                {dialog === "backup"
                  ? "Back up now"
                  : dialog === "stop"
                    ? "Stop server"
                    : "Restart server"}
              </Button>
            </>
          )}
          {busy && (
            <p className="working" role="status">
              <Loader2 className="animate-spin" size={16} />
              Working… This may take a few minutes.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
