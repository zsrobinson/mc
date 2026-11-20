import { Link } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@zsrobinson/shell/ui/alert";
import { Button } from "@zsrobinson/shell/ui/button";

import { usePowerAction } from "@/lib/mutations";
import { isRunning } from "@/lib/state";
import type { Limits, Server } from "@/lib/types";
import { ConfirmAction } from "@zsrobinson/shell/blocks/confirm-action";

/** The host has no room for another server; offer to stop a running one. */
export function BudgetFull({
  servers,
  limits,
}: {
  servers: Server[];
  limits?: Limits;
}) {
  const running = servers.filter((server) => isRunning(server.state));
  const atCount = limits ? servers.length >= limits.maxServers : false;
  return (
    <Alert variant="destructive">
      <TriangleAlertIcon />
      <AlertTitle>
        {atCount
          ? `The limit of ${limits?.maxServers} servers is reached`
          : "No memory left for another server"}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        {atCount
          ? "Delete a server from its settings page first."
          : "Stop a running server to free its memory."}
        {!atCount && running.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {running.map((server) => (
              <StopButton key={server.name} name={server.name} />
            ))}
          </div>
        ) : null}
        {atCount ? (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            render={<Link to="/" />}
            nativeButton={false}
          >
            View servers
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function StopButton({ name }: { name: string }) {
  const power = usePowerAction(name);
  return (
    <ConfirmAction
      trigger={
        <Button variant="outline" size="sm" disabled={power.isPending}>
          Stop {name}
        </Button>
      }
      title={`Stop ${name}?`}
      confirmLabel="Stop server"
      onConfirm={() => power.mutateAsync("stop")}
    >
      The world is saved and players are disconnected.
    </ConfirmAction>
  );
}
