import { useState } from "react";
import { Button } from "@zsrobinson/shell/ui/button";
import { Spinner } from "@zsrobinson/shell/ui/spinner";
import { Textarea } from "@zsrobinson/shell/ui/textarea";

import { ConfirmAction } from "../confirm-action";
import { useApplyProperties } from "./use-apply-properties";

export function RawProperties({
  name,
  initial,
}: {
  name: string;
  initial: string;
}) {
  const [raw, setRaw] = useState(initial);
  const apply = useApplyProperties(name);
  const dirty = raw !== initial;

  return (
    <div className="flex flex-col gap-3">
      <Textarea
        aria-label="server.properties"
        spellCheck={false}
        className="h-[50vh] min-h-64 resize-y font-mono text-xs leading-5"
        value={raw}
        onChange={(event) => setRaw(event.target.value)}
      />
      <p className="text-sm text-muted-foreground">
        The RCON password is hidden and cannot be changed here.
      </p>
      <div className="flex gap-2">
        <ConfirmAction
          trigger={
            <Button disabled={!dirty || apply.isPending}>
              {apply.isPending ? <Spinner data-icon="inline-start" /> : null}
              Apply file
            </Button>
          }
          title="Apply server.properties and restart?"
          confirmLabel="Back up and restart"
          onConfirm={() => apply.mutateAsync({ raw, confirm: true })}
        >
          The server is backed up, then restarts with this file.
        </ConfirmAction>
        <Button
          variant="ghost"
          disabled={!dirty || apply.isPending}
          onClick={() => setRaw(initial)}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
