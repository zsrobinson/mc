import { createFileRoute } from "@tanstack/react-router";
import { PageStack } from "@zsrobinson/shell";
import { Tabs, TabsList, TabsTrigger } from "@zsrobinson/shell/ui/tabs";
import { VersionCard } from "@/components/software/version-card";
import { InstalledCard } from "@/components/mods/installed-card";
import { DatapackUploadCard } from "@/components/mods/datapack-upload-card";
import { useServer } from "@/lib/use-server";
import type { ProjectKind } from "@/components/mods/kinds";
export const Route = createFileRoute("/servers/$name/mods")({
  staticData: { crumb: "Mods" },
  validateSearch: (s: Record<string, unknown>): { kind: ProjectKind } => ({
    kind: s.kind === "datapack" ? "datapack" : "mod",
  }),
  component: Mods,
});
function Mods() {
  const { name } = Route.useParams();
  const { kind } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: server } = useServer(name);
  if (!server) return null;
  return (
    <PageStack>
      <VersionCard server={server} />
      <Tabs
        value={kind}
        onValueChange={(v) =>
          void navigate({ search: { kind: v as ProjectKind }, replace: true })
        }
      >
        <InstalledCard
          key={kind}
          server={server}
          kind={kind}
          tabs={
            <TabsList>
              <TabsTrigger value="mod">Mods</TabsTrigger>
              <TabsTrigger value="datapack">Datapacks</TabsTrigger>
            </TabsList>
          }
        />
        {kind === "datapack" ? <DatapackUploadCard name={name} /> : null}
      </Tabs>
    </PageStack>
  );
}
