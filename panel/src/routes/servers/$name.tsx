import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { Page, PageHeader, PageTitle, PageMeta } from "@zsrobinson/shell";
import { QueryError } from "@zsrobinson/shell/blocks/query-error";
import { Address } from "@/components/address";
import { statusQuery } from "@/lib/queries";
import { useServer } from "@/lib/use-server";
export const Route = createFileRoute("/servers/$name")({
  loader: ({ context: { queryClient }, params }) => {
    void queryClient.prefetchQuery(statusQuery(params.name));
  },
  component: ServerLayout,
});
const labels: Record<string, string> = {
  console: "Console",
  players: "Players",
  mods: "Mods",
  software: "Mods",
  world: "World",
  backups: "Backups",
  files: "Files",
  settings: "Settings",
};
function ServerLayout() {
  const { name } = Route.useParams();
  const server = useServer(name);
  const path = useLocation({ select: (l) => l.pathname });
  const page = labels[path.split("/")[3]] ?? "Overview";
  return (
    <Page>
      {page !== "Backups" ? (
        <PageHeader>
          <PageTitle>{page}</PageTitle>
        </PageHeader>
      ) : null}
      {page === "Overview" && server.data?.joinAddress ? (
        <PageMeta>
          <Address value={server.data.joinAddress} label="join address" />
        </PageMeta>
      ) : null}
      {server.isError && !server.data ? (
        <QueryError
          title="Server status could not be loaded"
          error={server.error}
          onRetry={() => server.refetch()}
        />
      ) : (
        <Outlet />
      )}
    </Page>
  );
}
