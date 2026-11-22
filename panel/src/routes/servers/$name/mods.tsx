import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageStack, PageTitle } from "@zsrobinson/shell";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@zsrobinson/shell/ui/tabs";
import { VersionCard } from "@/components/software/version-card";
import { InstalledCard } from "@/components/mods/installed-card";
import { DatapackUploadCard } from "@/components/mods/datapack-upload-card";
import { useServer } from "@/lib/use-server";
import type { ProjectKind } from "@/components/mods/kinds";
import type { Server } from "@/lib/types";
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
  return (
    <PageStack>
      <PageHeader>
        <PageTitle>Mods</PageTitle>
      </PageHeader>
      {server ? (
        <ModsBody
          server={server}
          kind={kind}
          onKind={(v) => void navigate({ search: { kind: v }, replace: true })}
        />
      ) : (
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-32 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      )}
    </PageStack>
  );
}

function ModsBody({
  server,
  kind,
  onKind,
}: {
  server: Server;
  kind: ProjectKind;
  onKind: (kind: ProjectKind) => void;
}) {
  const name = server.name;
  return (
    <>
      <VersionCard server={server} />
      <Tabs value={kind} onValueChange={(v) => onKind(v as ProjectKind)}>
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
    </>
  );
}
