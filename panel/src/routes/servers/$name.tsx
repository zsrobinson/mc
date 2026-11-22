import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router";
import { Page, PageHeader, PageTitle } from "@zsrobinson/shell";
import { QueryError } from "@zsrobinson/shell/blocks/query-error";
import { statusQuery } from "@/lib/queries";
import { useServer } from "@/lib/use-server";

export const Route = createFileRoute("/servers/$name")({
  loader: ({ context: { queryClient }, params }) => {
    void queryClient.prefetchQuery(statusQuery(params.name));
  },
  component: ServerLayout,
});

/** Every server page shares the page column; each page renders its own header. */
function ServerLayout() {
  const { name } = Route.useParams();
  const server = useServer(name);
  const viewport = useMatches({
    select: (matches) => matches.some((match) => match.staticData.viewport),
  });
  if (server.isError && !server.data)
    return (
      <Page>
        <PageHeader>
          <PageTitle>{name}</PageTitle>
        </PageHeader>
        <QueryError
          title="Server status could not be loaded"
          error={server.error}
          onRetry={() => server.refetch()}
        />
      </Page>
    );
  if (viewport) return <Outlet />;
  return (
    <Page>
      <Outlet />
    </Page>
  );
}
