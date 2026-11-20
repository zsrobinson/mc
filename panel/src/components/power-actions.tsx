import {
  EllipsisIcon,
  PlayIcon,
  RotateCwIcon,
  SquareIcon,
  ZapIcon,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@zsrobinson/shell/ui/dropdown-menu";
import { Spinner } from "@zsrobinson/shell/ui/spinner";

import { usePowerAction, type PowerAction } from "@/lib/mutations";
import { stateTone } from "@/lib/state";
import type { Server } from "@/lib/types";
import { ConfirmAction } from "./confirm-action";

/** Start, or Restart and Stop; Kill sits in a secondary menu. */
export function PowerActions({ server }: { server: Server }) {
  const power = usePowerAction(server.name);
  const [killOpen, setKillOpen] = useState(false);
  const tone = stateTone(server.state);
  const busy = power.isPending || tone === "busy";
  const pendingAction = power.isPending ? power.variables : undefined;
  const icon = (action: PowerAction, Icon: typeof PlayIcon) =>
    pendingAction === action ? (
      <Spinner data-icon="inline-start" />
    ) : (
      <Icon data-icon="inline-start" />
    );

  if (tone !== "on" && tone !== "busy")
    return (
      <Button disabled={busy} onClick={() => power.mutate("start")}>
        {icon("start", PlayIcon)}
        Start
      </Button>
    );

  return (
    <>
      <ConfirmAction
        trigger={
          <Button variant="outline" disabled={busy}>
            {icon("restart", RotateCwIcon)}
            Restart
          </Button>
        }
        title={`Restart ${server.name}?`}
        confirmLabel="Restart"
        onConfirm={() => power.mutateAsync("restart")}
      >
        Players are disconnected while the world saves and the server starts
        again.
      </ConfirmAction>
      <ConfirmAction
        trigger={
          <Button variant="outline" disabled={busy}>
            {icon("stop", SquareIcon)}
            Stop
          </Button>
        }
        title={`Stop ${server.name}?`}
        confirmLabel="Stop server"
        onConfirm={() => power.mutateAsync("stop")}
      >
        The world is saved and players are disconnected.
      </ConfirmAction>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="More power actions"
              disabled={pendingAction === "kill"}
            />
          }
        >
          {pendingAction === "kill" ? <Spinner /> : <EllipsisIcon />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setKillOpen(true)}
          >
            <ZapIcon />
            Kill process
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmAction
        open={killOpen}
        onOpenChange={setKillOpen}
        title={`Kill ${server.name}?`}
        confirmLabel="Kill process"
        destructive
        onConfirm={() => power.mutateAsync("kill")}
      >
        The process ends immediately without saving. Changes since the last
        autosave are lost. Use this only when Stop does not respond.
      </ConfirmAction>
    </>
  );
}
