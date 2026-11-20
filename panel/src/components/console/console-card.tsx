import { useQuery } from "@tanstack/react-query";
import { DownloadIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@zsrobinson/shell/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@zsrobinson/shell/ui/input-group";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";
import { Spinner } from "@zsrobinson/shell/ui/spinner";
import { Switch } from "@zsrobinson/shell/ui/switch";

import { downloadUrl } from "@/lib/api";
import { useControlMutation } from "@/lib/mutations";
import { logsQuery } from "@/lib/queries";
import { useCommandHistory } from "@/lib/use-command-history";
import { useLogStream } from "@/lib/use-log-stream";
import { ConnectionStatus } from "./connection-status";

type Exchange = { id: number; command: string; reply: string };

// The control service polls over RCON; each poll logs a connect/disconnect.
const RCON_NOISE =
  /\[RCON (?:Listener|Client)\b.*Thread RCON Client\b.*\b(?:started|shutting down)\s*$/;

function withoutRconNoise(text: string) {
  return text
    .split("\n")
    .filter((line) => !RCON_NOISE.test(line))
    .join("\n");
}

export function ConsoleCard({ name }: { name: string }) {
  // Server-sent events while connected; polling stands in while it reconnects.
  const streaming = useLogStream(name);
  const logs = useQuery({
    ...logsQuery(name),
    refetchInterval: streaming ? false : 2_000,
  });
  const [command, setCommand] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const history = useCommandHistory(name);
  const viewport = useRef<HTMLPreElement>(null);
  const pinned = useRef(true);
  const [showRcon, setShowRcon] = useState(false);
  const output = logs.data
    ? showRcon
      ? logs.data.text
      : withoutRconNoise(logs.data.text)
    : "";

  const rcon = useControlMutation<{ command: string }, { text: string }>(
    "rcon",
    name,
    {
      onSuccess: (result, payload) =>
        setExchanges((previous) => [
          ...previous.slice(-49),
          { id: Date.now(), command: payload.command, reply: result.text },
        ]),
    },
  );

  // Follow new output unless the reader has scrolled up.
  useLayoutEffect(() => {
    const element = viewport.current;
    if (element && pinned.current) element.scrollTop = element.scrollHeight;
  }, [logs.data, exchanges]);

  function submit() {
    const value = command.trim();
    if (!value || rcon.isPending) return;
    history.push(value);
    setCommand("");
    rcon.mutate({ command: value.replace(/^\//, "") });
  }

  function recall(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const next = history.step(event.key === "ArrowUp" ? -1 : 1);
    if (next === undefined) return;
    event.preventDefault();
    setCommand(next);
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Console</CardTitle>
        <CardAction className="flex items-center gap-3">
          <ConnectionStatus query={logs} streaming={streaming} />
          <label className="flex items-center gap-2 text-xs text-muted-foreground max-sm:hidden">
            <Switch
              size="sm"
              checked={showRcon}
              onCheckedChange={setShowRcon}
            />
            RCON lines
          </label>
          <Button
            variant="outline"
            size="sm"
            render={
              <a
                href={downloadUrl("download-log", name, { path: "latest.log" })}
                download
              />
            }
            nativeButton={false}
          >
            <DownloadIcon data-icon="inline-start" />
            latest.log
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {logs.isPending ? (
          <div className="flex h-[55vh] min-h-72 flex-col gap-2 rounded-2xl bg-muted/50 p-4">
            {[90, 75, 82, 60, 70].map((width) => (
              <Skeleton
                key={width}
                className="h-3"
                style={{ width: `${width}%` }}
              />
            ))}
          </div>
        ) : (
          <pre
            ref={viewport}
            role="log"
            tabIndex={0}
            aria-label="Server output"
            onScroll={(event) => {
              const element = event.currentTarget;
              pinned.current =
                element.scrollHeight -
                  element.scrollTop -
                  element.clientHeight <
                32;
            }}
            className="h-[55vh] min-h-72 overflow-auto rounded-2xl bg-muted/50 p-4 font-mono text-xs leading-5 whitespace-pre-wrap break-words outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {output || (
              <span className="text-muted-foreground">No output yet</span>
            )}
            {exchanges.map((exchange) => (
              <span key={exchange.id} className="block">
                <span className="text-primary">{"> " + exchange.command}</span>
                {exchange.reply ? "\n" + exchange.reply : null}
              </span>
            ))}
          </pre>
        )}
      </CardContent>
      <CardFooter>
        <form
          className="w-full"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <InputGroup>
            <InputGroupAddon>
              <span aria-hidden="true" className="font-mono">
                &gt;
              </span>
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Console command"
              placeholder="Command, for example list"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className="font-mono"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              onKeyDown={recall}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="submit"
                variant="secondary"
                size="sm"
                className="px-3"
                disabled={!command.trim() || rcon.isPending}
              >
                {rcon.isPending ? <Spinner /> : null}
                Send
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
      </CardFooter>
    </Card>
  );
}
