import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader } from "@zsrobinson/shell/ui/card";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";
import { ResourcesCard } from "@/components/settings/resources-card";
import { useServer } from "@/lib/use-server";

export const Route = createFileRoute("/servers/$name/settings/resources")({
  staticData: { crumb: "Resources" },
  component: ResourceSettings,
});

function ResourceSettings() {
  const { name } = Route.useParams();
  const { data: server } = useServer(name);
  return server ? (
    <ResourcesCard key={`${server.memory}:${server.port}`} server={server} />
  ) : (
    <Card aria-busy="true">
      <CardHeader>
        <Skeleton className="h-5 w-24" />
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </CardContent>
    </Card>
  );
}
