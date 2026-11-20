import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@zsrobinson/shell/ui/card";
import { Progress } from "@zsrobinson/shell/ui/progress";

import { describeUtcTime, effectiveTimes } from "@/lib/schedule";
import {
  formatBytes,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatRelative,
  parsePlayers,
  pluralize,
} from "@/lib/format";
import { isRunning } from "@/lib/state";
import type { Server } from "@/lib/types";
import { Address } from "./address";
import {
  DetailList,
  DetailRow,
  Unavailable,
} from "@zsrobinson/shell/blocks/detail-list";
import { DnsBadge } from "./dns/dns-badge";
import { FixDnsButton } from "./dns/fix-dns-button";
import { needsFix, useServerDns } from "./dns/use-server-dns";

function OverviewCard({
  title,
  to,
  name,
  action,
  children,
}: {
  title: string;
  to?: LinkProps["to"];
  name: string;
  action?: string;
  children: ReactNode;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {to && action ? (
          <CardAction>
            <Button
              variant="ghost"
              size="xs"
              render={<Link to={to} params={{ name }} />}
              nativeButton={false}
            >
              {action}
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function metric<T>(
  server: Server,
  value: T | null | undefined,
  show: (value: T) => ReactNode,
) {
  if (value !== null && value !== undefined) return show(value);
  return (
    <Unavailable>
      {isRunning(server.state) ? "Unavailable" : "Not running"}
    </Unavailable>
  );
}

export function ResourcesCard({ server }: { server: Server }) {
  const m = server.metrics;
  const used = m?.memoryBytes ?? null;
  const limit = m?.memoryLimitBytes ?? null;
  return (
    <OverviewCard title="Performance" name={server.name}>
      <DetailList>
        <DetailRow label="Uptime">
          {metric(server, m?.uptimeSeconds, formatDuration)}
        </DetailRow>
        <DetailRow label="CPU">
          {metric(server, m?.cpuPercent, formatPercent)}
        </DetailRow>
        <DetailRow label="Memory" className="flex-wrap">
          {used !== null ? (
            <span className="flex flex-col items-end gap-1.5">
              <span>
                {formatBytes(used)}
                {limit ? (
                  <span className="text-muted-foreground">
                    {" "}
                    of {formatBytes(limit)}
                  </span>
                ) : null}
              </span>
              {limit ? (
                <Progress
                  value={Math.min(100, (used / limit) * 100)}
                  aria-label="Memory used"
                  className="w-32 *:data-[slot=progress-track]:h-1.5"
                />
              ) : null}
            </span>
          ) : (
            metric(server, null, () => null)
          )}
        </DetailRow>
        {/* Only shown when measured; a target tick rate is not a measurement. */}
        {m?.tps !== null && m?.tps !== undefined ? (
          <DetailRow label="TPS">{m.tps.toFixed(1)}</DetailRow>
        ) : null}
        <DetailRow label="MSPT">
          {metric(server, m?.mspt, (mspt) => `${mspt.toFixed(1)} ms`)}
        </DetailRow>
      </DetailList>
    </OverviewCard>
  );
}

export function PlayersCard({ server }: { server: Server }) {
  const players = parsePlayers(server.players);
  return (
    <OverviewCard
      title="Players"
      name={server.name}
      to="/servers/$name/players"
      action="Manage"
    >
      {players ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            <span className="font-medium tabular-nums">
              {players.online} of {players.max}
            </span>{" "}
            <span className="text-muted-foreground">online</span>
          </p>
          {players.names.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {players.names.map((player) => (
                <li
                  key={player}
                  className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium"
                >
                  {player}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {isRunning(server.state)
            ? "Player count unavailable"
            : "Server is not running"}
        </p>
      )}
    </OverviewCard>
  );
}

export function ConnectionCard({ server }: { server: Server }) {
  const { dns } = useServerDns(server);
  return (
    <OverviewCard title="Connection" name={server.name}>
      <DetailList>
        <DetailRow label="Join address">
          {server.joinAddress ? (
            <Address value={server.joinAddress} label="join address" />
          ) : (
            <Unavailable>Not configured</Unavailable>
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
            <Unavailable>Not configured</Unavailable>
          )}
        </DetailRow>
        <DetailRow label="Game port">{server.port}</DetailRow>
        {dns ? (
          <DetailRow label="DNS">
            <span className="flex items-center gap-2">
              <DnsBadge dns={dns} />
              {needsFix(dns) && dns.managed !== false ? (
                <FixDnsButton name={server.name} dns={dns} size="xs" />
              ) : null}
            </span>
          </DetailRow>
        ) : null}
      </DetailList>
    </OverviewCard>
  );
}

export function SoftwareCard({ server }: { server: Server }) {
  return (
    <OverviewCard
      title="Software"
      name={server.name}
      to="/servers/$name/software"
      action="Upgrade"
    >
      <DetailList>
        <DetailRow label="Minecraft">{server.version}</DetailRow>
        <DetailRow label="Fabric loader">
          {server.fabricLoader ?? <Unavailable>Not reported</Unavailable>}
        </DetailRow>
        <DetailRow label="Java image">
          <span className="font-mono text-code">{server.javaTag}</span>
        </DetailRow>
        <DetailRow label="Content">
          {pluralize(server.mods.length, "mod")},{" "}
          {pluralize(server.datapacks.length, "datapack")}
        </DetailRow>
      </DetailList>
    </OverviewCard>
  );
}

export function BackupCard({ server }: { server: Server }) {
  const times = effectiveTimes(server);
  return (
    <OverviewCard
      title="Backups"
      name={server.name}
      to="/servers/$name/backups"
      action="View all"
    >
      <DetailList>
        <DetailRow label="Last backup">
          {server.backup ? (
            <span title={formatDateTime(server.backup.at)}>
              {formatRelative(server.backup.at)}
              <span className="text-muted-foreground">
                {" "}
                · {pluralize(server.backup.targets, "copy", "copies")}
              </span>
            </span>
          ) : (
            <Unavailable>None yet</Unavailable>
          )}
        </DetailRow>
        <DetailRow label="Daily backup">
          {times.backupAt ? (
            <span>
              {describeUtcTime(times.backupAt)}
              {times.backupInherited ? (
                <span className="text-muted-foreground">
                  {" "}
                  · nightly default
                </span>
              ) : null}
            </span>
          ) : (
            <Unavailable>Nightly default</Unavailable>
          )}
        </DetailRow>
        <DetailRow label="Daily restart">
          {times.restartAt ? (
            describeUtcTime(times.restartAt)
          ) : (
            <Unavailable>Off</Unavailable>
          )}
        </DetailRow>
      </DetailList>
    </OverviewCard>
  );
}
