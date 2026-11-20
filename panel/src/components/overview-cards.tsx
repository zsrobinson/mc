import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardAction,
} from "@zsrobinson/shell/ui/card";
import { Progress } from "@zsrobinson/shell/ui/progress";
import { Badge } from "@zsrobinson/shell/ui/badge";
import {
  DetailList,
  DetailRow,
  Unavailable,
} from "@zsrobinson/shell/blocks/detail-list";
import { formatBytes, formatDuration, formatPercent } from "@/lib/format";
import { playersQuery } from "@/lib/queries";
import type { Server } from "@/lib/types";
import { Address } from "./address";
import { DnsBadge } from "./dns/dns-badge";
import { FixDnsButton } from "./dns/fix-dns-button";
import { useServerDns, needsFix } from "./dns/use-server-dns";
export function ResourcesCard({ server }: { server: Server }) {
  const m = server.metrics;
  const memory = m?.memoryBytes;
  const limit = m?.memoryLimitBytes;
  const tiles = [
    [
      "Uptime",
      m?.uptimeSeconds != null ? formatDuration(m.uptimeSeconds) : "—",
    ],
    ["CPU", m?.cpuPercent != null ? formatPercent(m.cpuPercent) : "—"],
    ["Memory", memory != null ? formatBytes(memory) : "—"],
    ["MSPT", m?.mspt != null ? `${m.mspt.toFixed(1)} ms` : "—"],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance</CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            render={
              <Link
                to="/servers/$name/console"
                params={{ name: server.name }}
              />
            }
            nativeButton={false}
          >
            Console
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {tiles.map(([label, value]) => (
            <div key={label} className="min-w-0 rounded-xl bg-muted/50 p-3">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="mt-1 text-lg font-medium tabular-nums">
                {value}
              </div>
              {label === "Memory" && memory != null && limit ? (
                <Progress
                  aria-label="Memory used"
                  value={Math.min(100, (memory / limit) * 100)}
                  className="mt-2 *:data-[slot=progress-track]:h-2"
                />
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
export function PlayersCard({ server }: { server: Server }) {
  const players = useQuery(playersQuery(server.name));
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Players{" "}
          <span className="font-normal text-muted-foreground">
            {players.data?.online.length ?? "—"}
          </span>
        </CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            render={
              <Link
                to="/servers/$name/players"
                params={{ name: server.name }}
              />
            }
            nativeButton={false}
          >
            Manage
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {players.data?.online.length ? (
          <ul className="divide-y">
            {players.data.online.map((name) => (
              <li key={name} className="flex min-h-9 items-center gap-3">
                <img
                  src={`/api/player-head/${encodeURIComponent(name)}`}
                  width={24}
                  height={24}
                  alt=""
                  className="rounded-md"
                />
                <span>{name}</span>
                <Badge variant="outline" className="ml-auto">
                  Online
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">
            {players.isPending
              ? "Loading players"
              : players.isError
                ? "Players unavailable"
                : "Nobody online"}
            {players.data ? (
              <span className="ml-2 text-muted-foreground">
                {players.data.whitelist.length} whitelisted
              </span>
            ) : null}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
export function ConnectionCard({ server }: { server: Server }) {
  const { dns, checking, recheck } = useServerDns(server);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connection</CardTitle>
        <CardAction>
          <Button
            size="sm"
            variant="ghost"
            disabled={checking}
            onClick={recheck}
          >
            Check
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <DetailList>
          <DetailRow label="Join address">
            {server.joinAddress ? (
              <Address value={server.joinAddress} label="join address" />
            ) : (
              <Unavailable />
            )}
          </DetailRow>
          <DetailRow label="Direct address">
            {server.directAddress ? (
              <Address
                value={server.directAddress}
                label="direct address"
                muted
              />
            ) : (
              <Unavailable />
            )}
          </DetailRow>
          <DetailRow label="Game port">{server.port}</DetailRow>
          {dns?.recordName ? (
            <DetailRow label="SRV record">
              <span
                className="max-w-64 truncate font-mono text-xs"
                title={dns.recordName}
              >
                {dns.recordName}
              </span>
            </DetailRow>
          ) : null}
          <DetailRow label="DNS">
            {dns ? (
              <span className="flex items-center gap-2">
                <DnsBadge dns={dns} />
                {needsFix(dns) && dns.managed !== false ? (
                  <FixDnsButton name={server.name} dns={dns} size="sm" />
                ) : null}
              </span>
            ) : (
              <Unavailable />
            )}
          </DetailRow>
        </DetailList>
      </CardContent>
    </Card>
  );
}
