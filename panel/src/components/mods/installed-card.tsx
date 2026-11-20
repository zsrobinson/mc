import { useQuery } from "@tanstack/react-query";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@zsrobinson/shell/ui/card";
import { ItemGroup } from "@zsrobinson/shell/ui/item";
import { Spinner } from "@zsrobinson/shell/ui/spinner";

import { updatesQuery } from "@/lib/queries";
import type { Server } from "@/lib/types";
import { ConfirmAction } from "../confirm-action";
import { EmptyList, ListRow } from "../list-row";
import { QueryError } from "../query-error";
import { configKey, KIND_LABEL, type ProjectKind } from "./kinds";
import { useApplyProjects } from "./use-apply-projects";

export function InstalledCard({
  server,
  kind,
}: {
  server: Server;
  kind: ProjectKind;
}) {
  const key = configKey(kind);
  const installed = server[key];
  const remove = useApplyProjects(server.name, "Removed and restarted");
  const updates = useQuery({ ...updatesQuery(server.name), enabled: false });
  const apply = useApplyProjects(server.name, "Updated and restarted");
  const results = updates.data?.projects.filter(
    (project) => project.kind === kind,
  );
  const label = KIND_LABEL[kind];

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Installed {label.many.toLowerCase()}</CardTitle>
        <CardAction className="text-sm text-muted-foreground tabular-nums">
          {installed.length}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {installed.length === 0 ? (
          <EmptyList>No {label.many.toLowerCase()} installed</EmptyList>
        ) : (
          <ItemGroup>
            {installed.map((project) => (
              <ListRow key={project} name={project}>
                <ConfirmAction
                  trigger={
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={remove.isPending}
                    >
                      Remove
                    </Button>
                  }
                  title={`Remove ${project}?`}
                  confirmLabel="Remove and restart"
                  destructive
                  onConfirm={() =>
                    remove.mutateAsync({
                      [key]: installed.filter((item) => item !== project),
                    })
                  }
                >
                  A backup is taken first, then the server restarts without it.
                </ConfirmAction>
              </ListRow>
            ))}
          </ItemGroup>
        )}
        {updates.isError ? (
          <QueryError title="Update check failed" error={updates.error} />
        ) : null}
        {results ? <UpdateResults results={results} /> : null}
      </CardContent>
      {installed.length > 0 ? (
        <CardFooter className="gap-2">
          <Button
            variant="outline"
            disabled={updates.isFetching}
            onClick={() => updates.refetch()}
          >
            {updates.isFetching ? <Spinner data-icon="inline-start" /> : null}
            Check for updates
          </Button>
          {results ? (
            <ConfirmAction
              trigger={
                <Button
                  className="ml-auto"
                  disabled={
                    apply.isPending || results.some((r) => !r.compatible)
                  }
                >
                  Apply updates
                </Button>
              }
              title="Apply updates?"
              confirmLabel="Back up and restart"
              onConfirm={() => apply.mutateAsync({})}
            >
              The server is backed up, then restarts with the newest compatible
              builds.
            </ConfirmAction>
          ) : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}

function UpdateResults({
  results,
}: {
  results: { project: string; compatible: boolean; version: string | null }[];
}) {
  if (results.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 rounded-2xl bg-muted/50 p-3 text-sm">
      {results.map((result) => (
        <li key={result.project} className="flex justify-between gap-4">
          <span className="font-medium">{result.project}</span>
          <span
            className={
              result.compatible
                ? "font-mono text-xs leading-5"
                : "text-destructive"
            }
          >
            {result.version ?? "No compatible build"}
          </span>
        </li>
      ))}
    </ul>
  );
}
