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
import {
  NativeSelect,
  NativeSelectOption,
} from "@zsrobinson/shell/ui/native-select";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";
import { Spinner } from "@zsrobinson/shell/ui/spinner";

import { useControlMutation } from "@/lib/mutations";
import { upgradeCheckQuery, versionsQuery } from "@/lib/queries";
import type { Server } from "@/lib/types";
import { ConfirmAction } from "../confirm-action";
import { QueryError } from "../query-error";
import { CompatibilityList } from "./compatibility-list";

/** Versions are newest first; only those above the current one are offered. */
function newerVersions(versions: string[], current: string) {
  const index = versions.indexOf(current);
  return index < 0 ? versions : versions.slice(0, index);
}

export function MinecraftCard({ server }: { server: Server }) {
  const versions = useQuery(versionsQuery);
  const candidates = versions.data
    ? newerVersions(versions.data, server.version)
    : [];
  const [target, setTarget] = useState("");
  const selected = target || candidates[0] || "";
  const selectId = useId();

  const check = useQuery({
    ...upgradeCheckQuery(server.name, selected),
    enabled: Boolean(selected),
  });
  const upgrade = useControlMutation<{ version: string }, Server>(
    "apply-config",
    server.name,
    { success: (_, payload) => `Upgraded to ${payload.version}` },
  );
  const result = check.data;
  const ready =
    result?.projects.every((project) => project.compatible) ?? false;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Minecraft</CardTitle>
        <CardAction className="text-sm font-medium tabular-nums">
          {server.version}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {versions.isPending ? (
          <Skeleton className="h-9 w-full" />
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {versions.isError
              ? "Version list unavailable"
              : "This is the newest release"}
          </p>
        ) : (
          <Field>
            <FieldLabel htmlFor={selectId}>
              {candidates.length === 1
                ? `Minecraft ${candidates[0]} is available`
                : "Upgrade to"}
            </FieldLabel>
            <NativeSelect
              id={selectId}
              className="w-full"
              value={selected}
              onChange={(event) => setTarget(event.target.value)}
            >
              {candidates.map((version) => (
                <NativeSelectOption key={version} value={version}>
                  {version}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldDescription>
              Downgrades are not offered. Every mod and datapack is checked
              first.
            </FieldDescription>
          </Field>
        )}
        {result ? <CompatibilityList result={result} /> : null}
        {check.isError ? (
          <QueryError title="Compatibility check failed" error={check.error} />
        ) : null}
      </CardContent>
      {candidates.length > 0 ? (
        <CardFooter className="gap-2">
          {check.isFetching ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              Checking mods and datapacks
            </span>
          ) : check.isError ? (
            <Button variant="outline" onClick={() => check.refetch()}>
              Check again
            </Button>
          ) : null}
          <ConfirmAction
            trigger={
              <Button
                className="ml-auto"
                disabled={!ready || upgrade.isPending}
              >
                {upgrade.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : null}
                Upgrade
              </Button>
            }
            title={`Upgrade ${server.name} to ${selected}?`}
            confirmLabel="Back up and upgrade"
            onConfirm={() => upgrade.mutateAsync({ version: selected })}
          >
            The server is backed up to every destination, then recreated on{" "}
            {selected}. Worlds cannot be moved back to an older version.
          </ConfirmAction>
        </CardFooter>
      ) : null}
    </Card>
  );
}
