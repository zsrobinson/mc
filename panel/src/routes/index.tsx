import { useEffect, useState } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Page, PageHeader, PageTitle } from "@zsrobinson/shell";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@zsrobinson/shell/ui/card";
import { TrendChart } from "@zsrobinson/shell/blocks/chart-card";
import { QueryError } from "@zsrobinson/shell/blocks/query-error";
import { HistoryCharts } from "@/components/history-charts";
import { StateBadge } from "@/components/state-badge";
import { serversQuery, backupsQuery } from "@/lib/queries";
import { historyPoints, historyConfig, useHistory } from "@/lib/history";
import { parsePlayers } from "@/lib/format";
export const Route = createFileRoute("/")({ component: Dashboard });
function Dashboard() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const servers = useQuery(serversQuery);
  const names = (servers.data ?? []).map((s) => s.name);
  const history = useHistory("24h");
  const backups = useQueries({ queries: names.map(backupsQuery) });
  const snapshots = backups
    .flatMap((q, i) => (q.data ?? []).map((b) => ({ ...b, server: names[i] })))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const points = historyPoints(history.data, "players", names);
  const midnight = new Date(now);
  midnight.setUTCHours(0, 0, 0, 0);
  const today = points.filter(
    (p) =>
      p.time >= midnight.getTime() && names.some((name) => p[name] != null),
  );
  const todayPeak = today.length
    ? Math.max(
        ...today.map((p) => names.reduce((sum, n) => sum + (p[n] ?? 0), 0)),
      )
    : null;
  const latest =
    snapshots[0]?.createdAt ??
    servers.data
      ?.map((s) => s.backup?.at)
      .filter((s): s is string => !!s)
      .sort()
      .at(-1);
  return (
    <Page>
      <PageHeader>
        <PageTitle>Dashboard</PageTitle>
        <Link to="/new" className="text-sm underline underline-offset-4">
          New server
        </Link>
      </PageHeader>
      {servers.error && (
        <QueryError
          title="Servers could not be loaded"
          error={servers.error}
          onRetry={() => servers.refetch()}
        />
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          [
            "Servers running",
            servers.data
              ? `${servers.data.filter((s) => s.state === "running").length} / ${names.length}`
              : "—",
          ],
          [
            "Players online",
            servers.data
              ? servers.data.reduce(
                  (n, s) => n + (parsePlayers(s.players)?.online ?? 0),
                  0,
                )
              : "—",
          ],
          ["Peak players today", todayPeak ?? "—"],
          [
            "Last backup",
            latest
              ? now - Date.parse(latest) < 3600000
                ? `${Math.max(0, Math.floor((now - Date.parse(latest)) / 60000))}m ago`
                : `${Math.max(0, Math.floor((now - Date.parse(latest)) / 3600000))}h ago`
              : "—",
          ],
        ].map(([title, value]) => (
          <Card key={title}>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">
                {title}
              </CardTitle>
              <div className="text-2xl font-semibold tabular-nums">{value}</div>
            </CardHeader>
          </Card>
        ))}
      </div>
      <HistoryCharts names={names} />
      <Card>
        <CardHeader>
          <CardTitle>Servers</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {servers.data?.map((s) => (
            <Link
              key={s.name}
              to="/servers/$name"
              params={{ name: s.name }}
              className="flex min-w-0 flex-wrap items-center gap-4 py-3"
            >
              <span className="min-w-20 flex-1 font-medium">{s.name}</span>
              <StateBadge state={s.state} />
              <span className="text-sm tabular-nums">
                {parsePlayers(s.players)?.online ?? 0} players
              </span>
              <div className="w-28">
                <TrendChart
                  sparkline
                  label={`${s.name} player history`}
                  data={historyPoints(history.data, "players", [s.name])}
                  config={historyConfig([s.name])}
                />
              </div>
            </Link>
          ))}
          {servers.data?.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">
              Create a server to begin.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recent backups</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {snapshots.slice(0, 5).map((b) => (
            <Link
              key={b.server + b.id}
              to="/servers/$name/backups"
              params={{ name: b.server }}
              className="flex flex-wrap justify-between gap-2 py-3 text-sm"
            >
              <span className="font-medium">{b.server}</span>
              <span className="tabular-nums text-muted-foreground">
                {new Date(b.createdAt).toLocaleString()} ·{" "}
                {(b.bytes / 1048576).toFixed(0)} MiB
              </span>
            </Link>
          ))}
          {!snapshots.length && (
            <p className="text-sm text-muted-foreground">
              {backups.some((q) => q.isPending)
                ? "Loading backups…"
                : backups.some((q) => q.isError)
                  ? "Backups could not be loaded. Open a server’s Backups page to retry."
                  : "No backups yet"}
            </p>
          )}
        </CardContent>
      </Card>
    </Page>
  );
}
