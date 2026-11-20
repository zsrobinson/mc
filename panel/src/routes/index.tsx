import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import {
  Page,
  PageActions,
  PageHeader,
  PageMeta,
  PageTitle,
} from "@zsrobinson/shell";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyTitle,
} from "@zsrobinson/shell/ui/empty";

import { QueryError } from "@/components/query-error";
import { ServerList, ServerListSkeleton } from "@/components/server-list";
import { allocatedMiB } from "@/lib/budget";
import { formatMiB, pluralize } from "@/lib/format";
import { limitsQuery, serversQuery } from "@/lib/queries";

export const Route = createFileRoute("/")({
  loader: ({ context: { queryClient } }) => {
    void queryClient.prefetchQuery(limitsQuery);
  },
  component: ServersPage,
});

function ServersPage() {
  const servers = useQuery(serversQuery);
  const limits = useQuery(limitsQuery);

  return (
    <Page>
      <PageHeader>
        <div className="flex flex-col gap-1">
          <PageTitle>Servers</PageTitle>
          {servers.data ? (
            <PageMeta>
              <span>
                {limits.data
                  ? `${servers.data.length} of ${limits.data.maxServers} servers`
                  : pluralize(servers.data.length, "server")}
              </span>
              {limits.data ? (
                <span>
                  {formatMiB(allocatedMiB(servers.data))} of{" "}
                  {formatMiB(limits.data.memoryBudget)} memory allocated
                </span>
              ) : null}
            </PageMeta>
          ) : null}
        </div>
        <PageActions>
          <Button render={<Link to="/new" />} nativeButton={false}>
            <PlusIcon data-icon="inline-start" />
            New server
          </Button>
        </PageActions>
      </PageHeader>
      {servers.isPending ? (
        <ServerListSkeleton />
      ) : servers.isError ? (
        <QueryError
          title="Servers could not be loaded"
          error={servers.error}
          onRetry={() => servers.refetch()}
        />
      ) : servers.data.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No servers</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button render={<Link to="/new" />} nativeButton={false}>
              Create server
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ServerList servers={servers.data} />
      )}
    </Page>
  );
}
