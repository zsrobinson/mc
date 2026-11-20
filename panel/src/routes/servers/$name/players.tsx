import { HistoryCharts } from "@/components/history-charts";
import { PageGrid, SectionGroup } from "@zsrobinson/shell";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader } from "@zsrobinson/shell/ui/card";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";

import {
  BansCard,
  OnlineCard,
  OperatorsCard,
  WhitelistCard,
} from "@/components/players/player-cards";
import { QueryError } from "@zsrobinson/shell/blocks/query-error";
import { playersQuery } from "@/lib/queries";

export const Route = createFileRoute("/servers/$name/players")({
  staticData: { crumb: "Players" },
  loader: ({ context: { queryClient }, params }) => {
    void queryClient.prefetchQuery(playersQuery(params.name));
  },
  component: PlayersPage,
});

function PlayersPage() {
  const { name } = Route.useParams();
  const players = useQuery(playersQuery(name));

  if (players.isPending)
    return (
      <PageGrid aria-busy="true">
        {[0, 1, 2, 3].map((key) => (
          <Card key={key} size="sm">
            <CardHeader>
              <Skeleton className="h-5 w-24" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Skeleton className="h-11 sm:h-9 w-full" />
              <Skeleton className="h-11 sm:h-9 w-full" />
            </CardContent>
          </Card>
        ))}
      </PageGrid>
    );
  if (players.isError)
    return (
      <QueryError
        title="Players could not be loaded"
        error={players.error}
        onRetry={() => players.refetch()}
      />
    );

  return (
    <div className="grid gap-4">
      <HistoryCharts names={[name]} server={name} playersOnly />
      <PageGrid>
        <SectionGroup>
          <OnlineCard name={name} players={players.data} />
          <OperatorsCard name={name} players={players.data} />
        </SectionGroup>
        <SectionGroup>
          <WhitelistCard name={name} players={players.data} />
          <BansCard name={name} players={players.data} />
        </SectionGroup>
      </PageGrid>
    </div>
  );
}
