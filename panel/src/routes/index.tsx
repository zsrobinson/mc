import { useEffect, useState } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PlusIcon, ServerIcon } from "lucide-react";
import { Page, PageActions, PageHeader, PageTitle } from "@zsrobinson/shell";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@zsrobinson/shell/ui/card";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";
import { TrendChart } from "@zsrobinson/shell/blocks/chart-card";
import { EmptyState } from "@zsrobinson/shell/blocks/empty-state";
import { QueryError } from "@zsrobinson/shell/blocks/query-error";
import { RelativeTime } from "@zsrobinson/shell/blocks/relative-time";
import { HistoryCharts } from "@/components/history-charts";
import { StateBadge } from "@/components/state-badge";
import { serversQuery, backupsQuery } from "@/lib/queries";
import { historyPoints, historyConfig, useHistory } from "@/lib/history";
import {
  formatBytes,
  formatDateTime,
  parsePlayers,
  parseTime,
} from "@/lib/format";

export const Route = createFileRoute("/")({ component: Dashboard });

const DAY = 86_400_000;

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
    .sort((a, b) => parseTime(b.createdAt) - parseTime(a.createdAt));
  const points = historyPoints(history.data, "players", names);
  const midnight = Math.floor(now / DAY) * DAY;
  const today = points.filter(
    (p) => p.time >= midnight && names.some((name) => p[name] != null),
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
      .sort((a, b) => parseTime(a) - parseTime(b))
      .at(-1);
  const none = servers.data?.length === 0;
  const newServer = (
    <Button size="sm" render={<Link to="/new" />} nativeButton={false}>
      <PlusIcon data-icon="inline-start" />
      New server
    </Button>
  );

  return (
    <Page>
      <PageHeader>
        <PageTitle>Dashboard</PageTitle>
        {none ? null : <PageActions>{newServer}</PageActions>}
      </PageHeader>
      {servers.error && !servers.data ? (
        <QueryError
          title="Servers could not be loaded"
          error={servers.error}
          onRetry={() => servers.refetch()}
        />
      ) : null}
      {none ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={<ServerIcon />}
              title="No servers yet"
              description="A name is all it takes; version, memory, port and backups are chosen for you."
              action={newServer}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {(
              [
                [
                  "Servers running",
                  servers.data
                    ? `${servers.data.filter((s) => s.state === "running").length} / ${names.length}`
                    : null,
                ],
                [
                  "Players online",
                  servers.data
                    ? servers.data.reduce(
                        (n, s) => n + (parsePlayers(s.players)?.online ?? 0),
                        0,
                      )
                    : null,
                ],
                [
                  "Peak players today",
                  history.isPending ? null : (todayPeak ?? "—"),
                ],
                [
                  "Last backup",
                  servers.isPending ? null : latest ? (
                    <RelativeTime value={latest} now={now} />
                  ) : (
                    "—"
                  ),
                ],
              ] as const
            ).map(([title, value]) => (
              <Card key={title}>
                <CardHeader>
                  <CardTitle className="text-sm text-muted-foreground">
                    {title}
                  </CardTitle>
                  <div className="text-2xl font-semibold tabular-nums">
                    {value ?? <Skeleton className="mt-1 h-7 w-16" />}
                  </div>
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
              {servers.isPending
                ? [0, 1].map((key) => (
                    <Skeleton key={key} className="my-2 h-9 w-full" />
                  ))
                : servers.data?.map((s) => (
                    <Link
                      key={s.name}
                      to="/servers/$name"
                      params={{ name: s.name }}
                      className="-mx-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-2 py-3 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span className="min-w-20 flex-1 font-medium">
                        {s.name}
                      </span>
                      <StateBadge state={s.state} />
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {parsePlayers(s.players)?.online ?? 0} online
                      </span>
                      <div className="w-28 max-sm:hidden">
                        <TrendChart
                          sparkline
                          label={`${s.name} player history`}
                          data={historyPoints(history.data, "players", [
                            s.name,
                          ])}
                          config={historyConfig([s.name])}
                          emptyMessage=""
                        />
                      </div>
                    </Link>
                  ))}
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
                  className="-mx-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl px-2 py-3 text-sm outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="font-medium">{b.server}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatDateTime(b.createdAt)} · {formatBytes(b.bytes)}
                  </span>
                </Link>
              ))}
              {!snapshots.length ? (
                backups.some((q) => q.isPending) || servers.isPending ? (
                  <Skeleton className="h-9 w-full" />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {backups.some((q) => q.isError)
                      ? "Backups could not be loaded. Open a server’s Backups page to retry."
                      : "No backups yet"}
                  </p>
                )
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
    </Page>
  );
}
