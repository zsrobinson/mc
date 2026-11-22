import { createFileRoute } from "@tanstack/react-router";
import { PageGrid, PageHeader, PageStack, PageTitle } from "@zsrobinson/shell";
import {
  DownloadWorldCard,
  WorldChangesCard,
} from "@/components/world/world-cards";

export const Route = createFileRoute("/servers/$name/world/")({
  staticData: { crumb: "World" },
  component: WorldPage,
});

function WorldPage() {
  const { name } = Route.useParams();
  return (
    <PageStack>
      <PageHeader>
        <PageTitle>World</PageTitle>
      </PageHeader>
      <PageGrid layout="two">
        <DownloadWorldCard name={name} />
        <WorldChangesCard name={name} />
      </PageGrid>
    </PageStack>
  );
}
