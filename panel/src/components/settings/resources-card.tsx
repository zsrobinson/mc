import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@zsrobinson/shell/ui/card";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@zsrobinson/shell/ui/field";
import { Input } from "@zsrobinson/shell/ui/input";
import { Spinner } from "@zsrobinson/shell/ui/spinner";

import { availableHeapMiB } from "@/lib/budget";
import { formatMiB } from "@/lib/format";
import { useControlMutation } from "@/lib/mutations";
import { limitsQuery, serversQuery } from "@/lib/queries";
import type { Server } from "@/lib/types";
import { ConfirmAction } from "@zsrobinson/shell/blocks/confirm-action";

export function ResourcesCard({ server }: { server: Server }) {
  const limits = useQuery(limitsQuery);
  const servers = useQuery(serversQuery);
  const [memory, setMemory] = useState(String(server.memory));
  const [port, setPort] = useState(String(server.port));
  const memoryId = useId();
  const portId = useId();
  const apply = useControlMutation<{ memory?: number; port?: number }, Server>(
    "apply-config",
    server.name,
    { success: "Resources updated and server restarted" },
  );

  const maxHeap =
    limits.data && servers.data
      ? availableHeapMiB(limits.data, servers.data, server.name)
      : undefined;
  const memoryValue = Number(memory);
  const portValue = Number(port);
  const memoryError =
    !Number.isInteger(memoryValue) || memoryValue < 512
      ? "At least 512 MiB"
      : maxHeap !== undefined && memoryValue > maxHeap
        ? `At most ${maxHeap} MiB fits the shared budget`
        : null;
  const portError =
    !Number.isInteger(portValue) ||
    (limits.data &&
      (portValue < limits.data.portMin || portValue > limits.data.portMax))
      ? limits.data
        ? `Between ${limits.data.portMin} and ${limits.data.portMax}`
        : "Enter a port"
      : null;
  const changes = {
    ...(memoryValue !== server.memory ? { memory: memoryValue } : {}),
    ...(portValue !== server.port ? { port: portValue } : {}),
  };
  const dirty = Object.keys(changes).length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Resources</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Field data-invalid={memoryError ? true : undefined}>
          <FieldLabel htmlFor={memoryId}>Heap memory (MiB)</FieldLabel>
          <Input
            id={memoryId}
            type="number"
            inputMode="numeric"
            min={512}
            step={256}
            max={maxHeap}
            aria-invalid={memoryError ? true : undefined}
            value={memory}
            onChange={(event) => setMemory(event.target.value)}
          />
          <FieldDescription>
            {memoryError ??
              (maxHeap !== undefined
                ? `Up to ${formatMiB(maxHeap)} available`
                : " ")}
          </FieldDescription>
        </Field>
        <Field data-invalid={portError ? true : undefined}>
          <FieldLabel htmlFor={portId}>Game port</FieldLabel>
          <Input
            id={portId}
            type="number"
            inputMode="numeric"
            min={limits.data?.portMin}
            max={limits.data?.portMax}
            aria-invalid={portError ? true : undefined}
            value={port}
            onChange={(event) => setPort(event.target.value)}
          />
          <FieldDescription>
            {portError ?? "The join address keeps working after a port change."}
          </FieldDescription>
        </Field>
      </CardContent>
      <CardFooter className="gap-2">
        <ConfirmAction
          trigger={
            <Button
              disabled={
                !dirty || !!memoryError || !!portError || apply.isPending
              }
            >
              {apply.isPending ? <Spinner data-icon="inline-start" /> : null}
              Save
            </Button>
          }
          title="Apply and restart?"
          confirmLabel="Back up and restart"
          onConfirm={() => apply.mutateAsync(changes)}
        >
          The server is backed up, then recreated with the new resources.
        </ConfirmAction>
        <Button
          variant="ghost"
          disabled={!dirty || apply.isPending}
          onClick={() => {
            setMemory(String(server.memory));
            setPort(String(server.port));
          }}
        >
          Reset
        </Button>
      </CardFooter>
    </Card>
  );
}
