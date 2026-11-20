import { useState } from "react";
import { ConfirmAction } from "@zsrobinson/shell/blocks/confirm-action";
import { StateBadge } from "@/components/state-badge";
import { usePowerAction, type PowerAction } from "@/lib/mutations";
import type { Server } from "@/lib/types";
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
  const [pending, setPending] = useState<{
    server: Server;
    verb: PowerAction;
  } | null>(null);
  const navigation = useServerNavigation((server, verb) =>
    setPending({ server, verb }),
  );
  const power = usePowerAction(pending?.server.name ?? "");
  const entity = navigation.flatMap((g) => g.items).find((item) => item.active);
  const servers = useQuery(serversQuery);
  const current = servers.data?.find((s) => s.name === entity?.id);
  const signedOut =
    session.error instanceof ApiError && session.error.status === 401;

  return (
    <AppShell
      name="Minecraft"
      email={session.data?.email}
      apps={session.isError ? [] : session.data?.services}
      navGroups={navigation}
      breadcrumbs={<AppBreadcrumbs />}
      entityBar={
        entity
          ? {
              entity,
              page: entity.children?.find((c) => c.active)?.label ?? "Overview",
              status: current ? <StateBadge state={current.state} /> : null,
            }
          : undefined
      }
    >
      {signedOut ? <SignedOut /> : <Outlet />}
      <ConfirmAction
        open={!!pending}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={`${pending?.verb ?? ""} ${pending?.server.name ?? ""}?`}
        confirmLabel={
          pending?.verb === "kill"
            ? "Kill process"
            : (pending?.verb ?? "Confirm")
        }
        destructive={pending?.verb === "kill"}
        onConfirm={async () => {
          if (pending) await power.mutateAsync(pending.verb);
          setPending(null);
        }}
      >
        {pending?.verb === "kill"
          ? "The process ends immediately without saving. Changes since the last autosave are lost. Use this only when Stop does not respond."
          : pending?.verb === "restart"
            ? "Players are disconnected while the world saves and the server starts again."
            : pending?.verb === "stop"
              ? "The world is saved and players are disconnected."
              : "The server starts with its current configuration."}
      </ConfirmAction>
    </AppShell>
  );
}
