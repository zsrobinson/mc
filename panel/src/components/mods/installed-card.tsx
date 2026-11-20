import { useQuery } from "@tanstack/react-query";
import { Badge } from "@zsrobinson/shell/ui/badge";
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
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@zsrobinson/shell/ui/item";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";
import { Spinner } from "@zsrobinson/shell/ui/spinner";

import { projectsQuery, updatesQuery } from "@/lib/queries";
import type { ProjectDetail, Server } from "@/lib/types";
import { ConfirmAction } from "@zsrobinson/shell/blocks/confirm-action";
import { EmptyList } from "@zsrobinson/shell/blocks/list-row";
import { QueryError } from "@zsrobinson/shell/blocks/query-error";
import { configKey, KIND_LABEL, type ProjectKind } from "./kinds";
import { ProjectIcon } from "./project-icon";
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
  const details = useQuery(projectsQuery(server.name));
  const byslug = new Map(
    (details.data?.[key] ?? []).map((detail) => [detail.slug, detail]),
  );
  const remove = useApplyProjects(server.name, "Removed and restarted");
  const apply = useApplyProjects(server.name, "Updated and restarted");
  const outdated = installed.filter(
    (slug) => byslug.get(slug)?.updateAvailable,
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
          <ItemGroup className="gap-2">
            {installed.map((slug) => (
              <ProjectRow
                key={slug}
                slug={slug}
                detail={byslug.get(slug)}
                loading={details.isPending}
                removing={remove.isPending}
                onRemove={() =>
                  remove.mutateAsync({
                    [key]: installed.filter((item) => item !== slug),
                  })
                }
              />
            ))}
          </ItemGroup>
        )}
        {details.isError && installed.length > 0 ? (
          <LegacyUpdates server={server} kind={kind} />
        ) : null}
      </CardContent>
      {outdated.length > 0 ? (
        <CardFooter>
          <ConfirmAction
            trigger={
              <Button disabled={apply.isPending}>
                {apply.isPending ? <Spinner data-icon="inline-start" /> : null}
                Update{" "}
                {outdated.length === 1
                  ? "1 project"
                  : `${outdated.length} projects`}
              </Button>
            }
            title="Apply updates?"
            confirmLabel="Back up and restart"
            onConfirm={() => apply.mutateAsync({})}
          >
            The server is backed up, then restarts with the newest compatible
            builds.
          </ConfirmAction>
        </CardFooter>
      ) : null}
    </Card>
  );
}

function ProjectRow({
  slug,
  detail,
  loading,
  removing,
  onRemove,
}: {
  slug: string;
  detail?: ProjectDetail;
  loading: boolean;
  removing: boolean;
  onRemove: () => Promise<unknown>;
}) {
  const title = detail?.title ?? slug;
  return (
    <Item size="sm" variant="muted" role="listitem">
      <ItemMedia>
        <ProjectIcon title={title} iconUrl={detail?.iconUrl} />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {loading ? (
            <Skeleton className="h-3.5 w-24" />
          ) : detail ? (
            <>
              <span className="font-mono">
                {detail.installedVersion ?? "Version unknown"}
              </span>
              {detail.updateAvailable && detail.latestVersion ? (
                <Badge variant="secondary">
                  Update available · {detail.latestVersion}
                </Badge>
              ) : null}
              {!detail.compatible ? (
                <Badge variant="destructive">Not compatible</Badge>
              ) : null}
            </>
          ) : (
            <span className="font-mono">{slug}</span>
          )}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <ConfirmAction
          trigger={
            <Button size="xs" variant="ghost" disabled={removing}>
              Remove
            </Button>
          }
          title={`Remove ${title}?`}
          confirmLabel="Remove and restart"
          destructive
          onConfirm={onRemove}
        >
          A backup is taken first, then the server restarts without it.
        </ConfirmAction>
      </ItemActions>
    </Item>
  );
}

/** For control services without mods-details: the older on-demand check. */
function LegacyUpdates({
  server,
  kind,
}: {
  server: Server;
  kind: ProjectKind;
}) {
  const updates = useQuery({ ...updatesQuery(server.name), enabled: false });
  const apply = useApplyProjects(server.name, "Updated and restarted");
  const results = updates.data?.projects.filter(
    (project) => project.kind === kind,
  );

  return (
    <div className="flex flex-col gap-3">
      {updates.isError ? (
        <QueryError title="Update check failed" error={updates.error} />
      ) : null}
      {results && results.length > 0 ? (
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
      ) : null}
      <div className="flex gap-2">
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
                disabled={apply.isPending || results.some((r) => !r.compatible)}
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
      </div>
    </div>
  );
}
