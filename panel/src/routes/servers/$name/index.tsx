import { createFileRoute } from "@tanstack/react-router";
import { PageStack } from "@zsrobinson/shell";
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
  if (!server) return null;
  return (
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <PageStack>
        <ResourcesCard server={server} />
        <PlayersCard server={server} />
      </PageStack>
      <ConnectionCard server={server} />
    </div>
  );
}
