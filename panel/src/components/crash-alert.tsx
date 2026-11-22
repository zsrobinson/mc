import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, OctagonXIcon } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@zsrobinson/shell/ui/alert";
import { Button } from "@zsrobinson/shell/ui/button";
import { RelativeTime } from "@zsrobinson/shell/blocks/relative-time";
import type { Server } from "@/lib/types";

/** Exit code 137 is SIGKILL, which the kernel's OOM killer sends. */
const looksOutOfMemory = (server: Server) =>
  server.lastExit?.oomKilled || server.lastExit?.exitCode === 137;

/** Why a crashed server stopped, and where to look next. */
export function CrashAlert({ server }: { server: Server }) {
  const exit = server.lastExit;
  return (
    <Alert variant="destructive">
      <OctagonXIcon />
      <AlertTitle>{server.name} stopped unexpectedly</AlertTitle>
      <AlertDescription>
        <p>
          {exit ? (
            <>
              The process exited with code{" "}
              <span className="font-mono">{exit.exitCode}</span>{" "}
              <RelativeTime value={exit.finishedAt} />.
            </>
          ) : (
            "The process exited without reporting why."
          )}{" "}
          {looksOutOfMemory(server)
            ? exit?.oomKilled
              ? "It ran out of memory and was stopped by the system. Give it more memory in Settings › Resources, or lower the view distance."
              : "Code 137 usually means it ran out of memory. Check the console, then consider more memory in Settings › Resources."
            : "The console shows the last lines it printed."}
        </p>
      </AlertDescription>
      <div className="col-start-2 mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          render={
            <Link to="/servers/$name/console" params={{ name: server.name }} />
          }
          nativeButton={false}
        >
          Open console
          <ChevronRightIcon data-icon="inline-end" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          render={
            <Link to="/servers/$name/activity" params={{ name: server.name }} />
          }
          nativeButton={false}
        >
          Activity
        </Button>
        {looksOutOfMemory(server) ? (
          <Button
            size="sm"
            variant="ghost"
            render={
              <Link
                to="/servers/$name/settings/resources"
                params={{ name: server.name }}
              />
            }
            nativeButton={false}
          >
            Memory settings
          </Button>
        ) : null}
      </div>
    </Alert>
  );
}
