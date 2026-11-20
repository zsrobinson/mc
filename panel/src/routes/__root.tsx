import type { QueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  Outlet,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { AppShell, Page } from "@zsrobinson/shell";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@zsrobinson/shell/ui/empty";

import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { QueryError } from "@/components/query-error";
import { ServerNav } from "@/components/server-nav";
import { ApiError } from "@/lib/api";
import { serversQuery, sessionQuery } from "@/lib/queries";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    loader: ({ context: { queryClient } }) => {
      // Start both requests at once without blocking the first paint.
      void queryClient.prefetchQuery(sessionQuery);
      void queryClient.prefetchQuery(serversQuery);
    },
    component: RootLayout,
    notFoundComponent: NotFound,
    errorComponent: RouteError,
  },
);

function RouteError({ error, reset }: ErrorComponentProps) {
  return (
    <Page>
      <QueryError
        title="This page failed to load"
        error={error}
        onRetry={reset}
      />
    </Page>
  );
}

function RootLayout() {
  const session = useQuery(sessionQuery);
  const signedOut =
    session.error instanceof ApiError && session.error.status === 401;

  return (
    <AppShell
      name="Minecraft"
      email={session.data?.email}
      apps={session.isError ? [] : session.data?.services}
      nav={<ServerNav />}
      breadcrumbs={<AppBreadcrumbs />}
    >
      {signedOut ? <SignedOut /> : <Outlet />}
    </AppShell>
  );
}

function SignedOut() {
  return (
    <Page>
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Signed out</EmptyTitle>
          <EmptyDescription>Your access session has ended.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => location.reload()}>Sign in again</Button>
        </EmptyContent>
      </Empty>
    </Page>
  );
}

function NotFound() {
  return (
    <Page>
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Page not found</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button render={<a href="/" />} nativeButton={false}>
            Go to servers
          </Button>
        </EmptyContent>
      </Empty>
    </Page>
  );
}
