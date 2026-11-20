import { PageGrid, PageStack, SectionGroup } from "@zsrobinson/shell";
import { createFileRoute } from "@tanstack/react-router";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@zsrobinson/shell/ui/toggle-group";

import { DatapackUploadCard } from "@/components/mods/datapack-upload-card";
import { InstalledCard } from "@/components/mods/installed-card";
import type { ProjectKind } from "@/components/mods/kinds";
import { SearchCard } from "@/components/mods/search-card";
import { useServer } from "@/lib/use-server";

export const Route = createFileRoute("/servers/$name/mods")({
  staticData: { crumb: "Mods" },
  validateSearch: (search: Record<string, unknown>): { kind: ProjectKind } => ({
    kind: search.kind === "datapack" ? "datapack" : "mod",
  }),
  component: ModsPage,
});

function ModsPage() {
  const { name } = Route.useParams();
  const { kind } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: server } = useServer(name);

  return (
    <PageStack>
      <ToggleGroup
        variant="outline"
        value={[kind]}
        aria-label="Content type"
        onValueChange={(value) => {
          if (value[0])
            void navigate({
              search: { kind: value[0] as ProjectKind },
              replace: true,
            });
        }}
      >
        <ToggleGroupItem value="mod">Mods</ToggleGroupItem>
        <ToggleGroupItem value="datapack">Datapacks</ToggleGroupItem>
      </ToggleGroup>
      {server ? (
        <PageGrid>
          <InstalledCard key={kind} server={server} kind={kind} />
          <SectionGroup>
            <SearchCard key={kind} server={server} kind={kind} />
            {kind === "datapack" ? <DatapackUploadCard name={name} /> : null}
          </SectionGroup>
        </PageGrid>
      ) : null}
    </PageStack>
  );
}
