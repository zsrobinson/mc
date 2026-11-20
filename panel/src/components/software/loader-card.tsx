import { useQuery } from "@tanstack/react-query";
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
import {
  NativeSelect,
  NativeSelectOption,
} from "@zsrobinson/shell/ui/native-select";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";
import { Spinner } from "@zsrobinson/shell/ui/spinner";

import { useControlMutation } from "@/lib/mutations";
import { loaderVersionsQuery } from "@/lib/queries";
import type { Server } from "@/lib/types";
import { ConfirmAction } from "../confirm-action";

const LOADER_VERSION = /^\d+\.\d+\.\d+$/;

/** Loader versions are newest first; offer only those above the current one. */
function newerLoaders(versions: string[], current?: string) {
  const index = current ? versions.indexOf(current) : -1;
  return index < 0 ? versions : versions.slice(0, index);
}

export function LoaderCard({ server }: { server: Server }) {
  const loaders = useQuery(loaderVersionsQuery(server.name));
  const candidates = loaders.data
    ? newerLoaders(loaders.data, server.fabricLoader)
    : [];
  const [chosen, setChosen] = useState("");
  const selectId = useId();
  const change = useControlMutation<{ loader: string; confirm: true }, Server>(
    "set-loader",
    server.name,
    { success: (_, payload) => `Fabric loader set to ${payload.loader}` },
  );
  // Without loader-versions, fall back to typing a version.
  const manual = loaders.isError;
  const value = manual ? chosen.trim() : chosen || candidates[0] || "";
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
        {loaders.isPending ? (
          <Skeleton className="h-9 w-full" />
        ) : manual ? (
          <Field>
            <FieldLabel htmlFor={selectId}>Loader version</FieldLabel>
            <Input
              id={selectId}
              inputMode="decimal"
              autoComplete="off"
              value={chosen}
              aria-invalid={
                chosen !== "" && !LOADER_VERSION.test(value) ? true : undefined
              }
              onChange={(event) => setChosen(event.target.value)}
            />
          </Field>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            This is the newest loader for {server.version}
          </p>
        ) : (
          <Field>
            <FieldLabel htmlFor={selectId}>Update to</FieldLabel>
            <NativeSelect
              id={selectId}
              className="w-full"
              value={value}
              onChange={(event) => setChosen(event.target.value)}
            >
              {candidates.map((version, index) => (
                <NativeSelectOption key={version} value={version}>
                  {index === 0 ? `${version} (newest)` : version}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldDescription>
              Compatible with Minecraft {server.version}.
            </FieldDescription>
          </Field>
        )}
      </CardContent>
      {manual || candidates.length > 0 ? (
        <CardFooter>
          <ConfirmAction
            trigger={
              <Button variant="outline" disabled={!valid || change.isPending}>
                {change.isPending ? <Spinner data-icon="inline-start" /> : null}
                Update loader
              </Button>
            }
            title={`Use Fabric loader ${value}?`}
            confirmLabel="Back up and update"
            onConfirm={() =>
              change.mutateAsync({ loader: value, confirm: true })
            }
          >
            The server is backed up, then recreated with this loader.
          </ConfirmAction>
        </CardFooter>
      ) : null}
    </Card>
  );
}
