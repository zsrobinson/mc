import { useId, useState } from "react";
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
  Field,
  FieldDescription,
  FieldLabel,
} from "@zsrobinson/shell/ui/field";
import { Input } from "@zsrobinson/shell/ui/input";
import { Spinner } from "@zsrobinson/shell/ui/spinner";

import { useControlMutation } from "@/lib/mutations";
import type { Server } from "@/lib/types";
import { ConfirmAction } from "../confirm-action";

const LOADER_VERSION = /^\d+\.\d+\.\d+$/;

export function LoaderCard({ server }: { server: Server }) {
  const [loader, setLoader] = useState("");
  const inputId = useId();
  const change = useControlMutation<{ loader: string; confirm: true }, Server>(
    "set-loader",
    server.name,
    { success: (_, payload) => `Fabric loader set to ${payload.loader}` },
  );
  const value = loader.trim();
  const valid = LOADER_VERSION.test(value) && value !== server.fabricLoader;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Fabric loader</CardTitle>
        <CardAction className="text-sm font-medium tabular-nums">
          {server.fabricLoader ?? (
            <span className="text-muted-foreground">Not reported</span>
          )}
        </CardAction>
      </CardHeader>
      <CardContent>
        <Field>
          <FieldLabel htmlFor={inputId}>Loader version</FieldLabel>
          <Input
            id={inputId}
            inputMode="decimal"
            placeholder="For example 0.16.10"
            autoComplete="off"
            value={loader}
            aria-invalid={
              value !== "" && !LOADER_VERSION.test(value) ? true : undefined
            }
            onChange={(event) => setLoader(event.target.value)}
          />
          <FieldDescription>
            Checked against {server.version} before the server is backed up and
            recreated.
          </FieldDescription>
        </Field>
      </CardContent>
      <CardFooter>
        <ConfirmAction
          trigger={
            <Button variant="outline" disabled={!valid || change.isPending}>
              {change.isPending ? <Spinner data-icon="inline-start" /> : null}
              Change loader
            </Button>
          }
          title={`Use Fabric loader ${value}?`}
          confirmLabel="Back up and change"
          onConfirm={() => change.mutateAsync({ loader: value, confirm: true })}
        >
          The server is backed up, then recreated with this loader.
        </ConfirmAction>
      </CardFooter>
    </Card>
  );
}
