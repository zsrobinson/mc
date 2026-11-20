import { PageGrid, SectionGroup } from "@zsrobinson/shell";
import { createFileRoute } from "@tanstack/react-router";

import {
  DownloadWorldCard,
  ReplaceWorldCard,
  ResetWorldCard,
} from "@/components/world/world-cards";

export const Route = createFileRoute("/servers/$name/world")({
  staticData: { crumb: "World" },
  component: WorldPage,
});

function WorldPage() {
  const { name } = Route.useParams();
  return (
    <PageGrid>
      <SectionGroup>
        <DownloadWorldCard name={name} />
        <ResetWorldCard name={name} />
      </SectionGroup>
      <ReplaceWorldCard name={name} />
    </PageGrid>
  );
}
