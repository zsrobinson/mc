import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageMeta, PageStack, PageTitle } from "@zsrobinson/shell";
import { Card, CardContent, CardHeader } from "@zsrobinson/shell/ui/card";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";
import { Address } from "@/components/address";
import { CrashAlert } from "@/components/crash-alert";
import { HistoryCharts } from "@/components/history-charts";
import {
  ResourcesCard,
  PlayersCard,
  ConnectionCard,
} from "@/components/overview-cards";
import { useServer } from "@/lib/use-server";

export const Route = createFileRoute("/servers/$name/")({
  component: Overview,
});

function Overview() {
  const { name } = Route.useParams();
  const { data: server } = useServer(name);
  return (
    <PageStack>
      <PageHeader>
        <PageTitle>Overview</PageTitle>
        {server?.joinAddress ? (
          <PageMeta>
            <Address value={server.joinAddress} label="join address" />
          </PageMeta>
        ) : null}
      </PageHeader>
      {server?.state === "crashed" ? <CrashAlert server={server} /> : null}
      {server ? (
        <>
          <HistoryCharts names={[name]} server={name} />
          <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <PageStack>
              <ResourcesCard server={server} />
              <PlayersCard server={server} />
            </PageStack>
            <ConnectionCard server={server} />
          </div>
        </>
      ) : (
        <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
          {[0, 1, 2, 3].map((key) => (
            <Card key={key}>
              <CardHeader>
                <Skeleton className="h-5 w-28" />
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageStack>
  );
}
