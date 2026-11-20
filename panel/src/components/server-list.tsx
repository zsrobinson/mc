import { Link } from "@tanstack/react-router";
import { Card } from "@zsrobinson/shell/ui/card";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";

import { formatMiB, parsePlayers } from "@/lib/format";
import type { Server } from "@/lib/types";
import { Address } from "./address";
import { StateBadge } from "./state-badge";

const ROW =
  "relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1.5 px-5 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_5.5rem_6.5rem]";

export function ServerList({ servers }: { servers: Server[] }) {
  return (
    <Card className="gap-0 py-0">
      <div
        aria-hidden="true"
        className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_5.5rem_6.5rem] gap-x-6 border-b px-5 py-2.5 text-xs font-medium text-muted-foreground md:grid"
      >
        <span>Server</span>
        <span>Address</span>
        <span>Players</span>
        <span>Status</span>
      </div>
      <ul className="divide-y">
        {servers.map((server) => (
          <ServerRow key={server.name} server={server} />
        ))}
      </ul>
    </Card>
  );
}

function ServerRow({ server }: { server: Server }) {
  const players = parsePlayers(server.players);
  return (
    <li className={`${ROW} transition-colors hover:bg-muted/50`}>
      <div className="min-w-0">
        <Link
          to="/servers/$name"
          params={{ name: server.name }}
          className="font-medium outline-none after:absolute after:inset-0 focus-visible:after:rounded-sm focus-visible:after:ring-3 focus-visible:after:ring-ring/50"
        >
          {server.name}
        </Link>
        <p className="truncate text-sm text-muted-foreground">
          Fabric {server.version} · {formatMiB(server.memory)}
        </p>
      </div>
      <div className="relative z-10 col-span-2 row-start-2 flex min-w-0 flex-col items-start md:col-span-1 md:row-start-auto">
        {server.joinAddress ? (
          <Address value={server.joinAddress} label="join address" />
        ) : (
          <span className="text-sm text-muted-foreground">No join address</span>
        )}
        {server.directAddress ? (
          <span className="truncate font-mono text-xs text-muted-foreground max-md:hidden">
            {server.directAddress}
          </span>
        ) : null}
      </div>
      <span className="text-sm tabular-nums max-md:hidden">
        {players ? (
          `${players.online} / ${players.max}`
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </span>
      <span className="col-start-2 row-start-1 justify-self-end md:col-start-auto md:row-start-auto md:justify-self-start">
        <StateBadge state={server.state} />
      </span>
    </li>
  );
}

export function ServerListSkeleton() {
  return (
    <Card className="gap-0 py-0" aria-busy="true" aria-label="Loading servers">
      <ul className="divide-y">
        {[0, 1].map((key) => (
          <li key={key} className={ROW}>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3.5 w-36" />
            </div>
            <Skeleton className="col-span-2 row-start-2 h-4 w-48 md:col-span-1 md:row-start-auto" />
            <Skeleton className="h-4 w-12 max-md:hidden" />
            <Skeleton className="h-5 w-20 justify-self-end md:justify-self-start" />
          </li>
        ))}
      </ul>
    </Card>
  );
}
