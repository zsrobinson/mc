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
    <PageStack>
      <ResourcesCard server={server} />
      <PlayersCard server={server} />
      <ConnectionCard server={server} />
    </PageStack>
  );
}
