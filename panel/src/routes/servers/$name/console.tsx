import { createFileRoute } from "@tanstack/react-router";
import { Page, PageHeader, PageTitle } from "@zsrobinson/shell";
import { Button } from "@zsrobinson/shell/ui/button";
import { ConsoleCard } from "@/components/console/console-card";
import { LogFilesCard } from "@/components/console/log-files-card";
export const Route = createFileRoute("/servers/$name/console")({
  staticData: { crumb: "Console" },
  validateSearch: (
    s: Record<string, unknown>,
  ): { view?: "live" | "files" } => ({
    view: s.view === "files" ? "files" : "live",
  }),
  component: ConsolePage,
});
function ConsolePage() {
  const { name } = Route.useParams();
  const { view = "live" } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Page viewport>
      <PageHeader className="shrink-0">
        <PageTitle>Console</PageTitle>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            void navigate({
              search: { view: view === "live" ? "files" : "live" },
            })
          }
        >
          {view === "live" ? "Log files" : "Live console"}
        </Button>
      </PageHeader>
      {view === "live" ? (
        <ConsoleCard name={name} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <LogFilesCard name={name} />
        </div>
      )}
    </Page>
  );
}
