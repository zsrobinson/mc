import type { QueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { AppShell } from "@zsrobinson/shell";
import {
  SignedOut,
  NotFound,
  RouteError,
} from "@zsrobinson/shell/blocks/page-states";

import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { useServerNavigation } from "@/components/server-nav";
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
    notFoundComponent: () => <NotFound homeLabel="Go to servers" />,
    errorComponent: RouteError,
  },
);

function RootLayout() {
  const session = useQuery(sessionQuery);
  const navigation = useServerNavigation();
  const signedOut =
    session.error instanceof ApiError && session.error.status === 401;

  return (
    <AppShell
      name="Minecraft"
      email={session.data?.email}
      apps={session.isError ? [] : session.data?.services}
      navGroups={navigation}
      breadcrumbs={<AppBreadcrumbs />}
    >
      {signedOut ? <SignedOut /> : <Outlet />}
    </AppShell>
  );
}
