import { PageGrid, SectionGroup } from "@zsrobinson/shell";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader } from "@zsrobinson/shell/ui/card";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";

import {
  BackupCard,
  ConnectionCard,
  PlayersCard,
  ResourcesCard,
  SoftwareCard,
} from "@/components/overview-cards";
import { useServer } from "@/lib/use-server";

export const Route = createFileRoute("/servers/$name/")({
  component: OverviewPage,
});

function OverviewPage() {
  const { name } = Route.useParams();
  const { data: server } = useServer(name);

  if (!server) return <OverviewSkeleton />;
  return (
    <PageGrid>
      <SectionGroup>
        <ResourcesCard server={server} />
        <ConnectionCard server={server} />
      </SectionGroup>
      <SectionGroup>
        <PlayersCard server={server} />
        <SoftwareCard server={server} />
        <BackupCard server={server} />
      </SectionGroup>
    </PageGrid>
  );
}

function OverviewSkeleton() {
  return (
    <PageGrid aria-busy="true">
      {[0, 1, 2, 3].map((key) => (
        <Card key={key} size="sm">
          <CardHeader>
            <Skeleton className="h-5 w-28" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </CardContent>
        </Card>
      ))}
    </PageGrid>
  );
}
