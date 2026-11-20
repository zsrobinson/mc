import { createFileRoute, Outlet } from "@tanstack/react-router";
import {
  Page,
  PageActions,
  PageHeader,
  PageMeta,
  PageTitle,
} from "@zsrobinson/shell";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";

import { Address } from "@/components/address";
import { DnsBadge } from "@/components/dns/dns-badge";
import { needsFix, useServerDns } from "@/components/dns/use-server-dns";
import { PowerActions } from "@/components/power-actions";
import { QueryError } from "@zsrobinson/shell/blocks/query-error";
import { StateBadge } from "@/components/state-badge";
import { parsePlayers } from "@/lib/format";
import { statusQuery } from "@/lib/queries";
import type { Server } from "@/lib/types";
import { useServer } from "@/lib/use-server";

export const Route = createFileRoute("/servers/$name")({
  loader: ({ context: { queryClient }, params }) => {
    void queryClient.prefetchQuery(statusQuery(params.name));
  },
  component: ServerLayout,
});

function ServerLayout() {
  const { name } = Route.useParams();
  const server = useServer(name);

  return (
    <Page>
      <PageHeader>
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-3">
            <PageTitle className="truncate">{name}</PageTitle>
            {server.data ? <StateBadge state={server.data.state} /> : null}
          </div>
          {server.data ? (
            <ServerMeta server={server.data} />
          ) : server.isPending ? (
            <Skeleton className="h-5 w-64" />
          ) : null}
        </div>
        <PageActions>
          {server.data ? <PowerActions server={server.data} /> : null}
        </PageActions>
      </PageHeader>
      {server.isError && !server.data ? (
        <QueryError
          title="Server status could not be loaded"
          error={server.error}
          onRetry={() => server.refetch()}
        />
      ) : (
        <Outlet />
      )}
    </Page>
  );
}

function ServerMeta({ server }: { server: Server }) {
  const players = parsePlayers(server.players);
  const { dns } = useServerDns(server);
  return (
    <PageMeta>
      {server.joinAddress ? (
        <Address
          value={server.joinAddress}
          label="join address"
          className="text-foreground"
        />
      ) : null}
      {dns && needsFix(dns) ? <DnsBadge dns={dns} /> : null}
      {server.directAddress ? (
        <Address
          value={server.directAddress}
          label="direct address"
          muted
          className="max-sm:hidden"
        />
      ) : null}
      <span>Minecraft {server.version}</span>
      {players ? (
        <span>
          {players.online} of {players.max} online
        </span>
      ) : null}
    </PageMeta>
  );
}
