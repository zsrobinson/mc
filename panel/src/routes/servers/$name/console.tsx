import { createFileRoute, Link } from "@tanstack/react-router";
import { Page, PageHeader, PageTitle } from "@zsrobinson/shell";
import { SectionNav } from "@zsrobinson/shell/blocks/section-nav";
import { ConsoleCard } from "@/components/console/console-card";
import { LogFilesCard } from "@/components/console/log-files-card";
export const Route = createFileRoute("/servers/$name/console")({
  staticData: { crumb: "Console", viewport: true },
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
  return (
    <Page viewport>
      <PageHeader className="shrink-0">
        <PageTitle>Console</PageTitle>
        <SectionNav
          label="Console views"
          className="pb-0"
          items={[
            {
              id: "live",
              label: "Live",
              active: view === "live",
              render: (
                <Link
                  to="/servers/$name/console"
                  params={{ name }}
                  search={{ view: "live" }}
                  activeOptions={{ exact: true, includeSearch: true }}
                  replace
                />
              ),
            },
            {
              id: "files",
              label: "Log files",
              active: view === "files",
              render: (
                <Link
                  to="/servers/$name/console"
                  params={{ name }}
                  search={{ view: "files" }}
                  activeOptions={{ exact: true, includeSearch: true }}
                  replace
                />
              ),
            },
          ]}
        />
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
