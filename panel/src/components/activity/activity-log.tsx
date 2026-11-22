import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { HistoryIcon } from "lucide-react";
import { Badge } from "@zsrobinson/shell/ui/badge";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@zsrobinson/shell/ui/card";
import {
  NativeSelect,
  NativeSelectOption,
} from "@zsrobinson/shell/ui/native-select";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";
import { Spinner } from "@zsrobinson/shell/ui/spinner";
import { EmptyState } from "@zsrobinson/shell/blocks/empty-state";
import { QueryError } from "@zsrobinson/shell/blocks/query-error";
import { RelativeTime } from "@zsrobinson/shell/blocks/relative-time";
import {
  StackedTable,
  type StackedColumn,
} from "@zsrobinson/shell/blocks/stacked-table";
import { actorLabel, isPerson, verbLabel } from "@/lib/activity";
import { pluralize } from "@/lib/format";
import { auditQuery } from "@/lib/queries";
import type { AuditEntry } from "@/lib/types";

export type OutcomeFilter = "all" | "ok" | "error";

function Outcome({ entry }: { entry: AuditEntry }) {
  return entry.outcome === "ok" ? (
    <Badge variant="positive">Succeeded</Badge>
  ) : (
    <Badge variant="destructive">Failed</Badge>
  );
}

/** Who did what, newest first, with older pages on request. */
export function ActivityLog({
  server,
  outcome,
  onOutcomeChange,
}: {
  /** Limit to one server; omit for every server. */
  server?: string;
  outcome: OutcomeFilter;
  onOutcomeChange: (outcome: OutcomeFilter) => void;
}) {
  const audit = useInfiniteQuery(auditQuery(server));
  const all = audit.data?.pages.flatMap((page) => page.entries) ?? [];
  const entries =
    outcome === "all" ? all : all.filter((entry) => entry.outcome === outcome);

  const columns: StackedColumn<AuditEntry>[] = [
    {
      id: "time",
      header: "Time",
      className: "w-32 whitespace-nowrap text-muted-foreground",
      stack: "detail",
      cell: (entry) => <RelativeTime value={entry.at} />,
    },
    {
      id: "action",
      header: "Action",
      stack: "title",
      cell: (entry) => (
        <span className="font-medium">{verbLabel(entry.verb)}</span>
      ),
    },
    ...(server
      ? []
      : [
          {
            id: "server",
            header: "Server",
            stack: "detail",
            cell: (entry) =>
              entry.server ? (
                <Link
                  to="/servers/$name/activity"
                  params={{ name: entry.server }}
                  className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {entry.server}
                </Link>
              ) : (
                <span className="text-muted-foreground">All servers</span>
              ),
          } satisfies StackedColumn<AuditEntry>,
        ]),
    {
      id: "actor",
      header: "By",
      stack: "detail",
      className: "max-w-48",
      cell: (entry) => (
        <span
          className={
            isPerson(entry.actor)
              ? "block truncate"
              : "block truncate text-muted-foreground"
          }
          title={entry.actor}
        >
          {actorLabel(entry.actor)}
        </span>
      ),
    },
    {
      id: "detail",
      header: "Detail",
      stack: "detail",
      className: "max-w-64 whitespace-normal",
      cell: (entry) =>
        entry.error ? (
          <span className="text-destructive">{entry.error}</span>
        ) : entry.detail ? (
          <span className="break-words text-muted-foreground">
            {entry.detail}
          </span>
        ) : null,
    },
    {
      id: "outcome",
      header: "Outcome",
      stack: "end",
      className: "w-28",
      cell: (entry) => <Outcome entry={entry} />,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex min-h-8 items-center gap-2">
          Entries
          {audit.data ? (
            <span className="font-normal text-muted-foreground tabular-nums">
              {entries.length}
              {audit.hasNextPage ? "+" : ""}
            </span>
          ) : null}
        </CardTitle>
        <CardAction>
          <label className="sr-only" htmlFor="activity-outcome">
            Outcome
          </label>
          <NativeSelect
            id="activity-outcome"
            size="sm"
            value={outcome}
            onChange={(event) =>
              onOutcomeChange(event.target.value as OutcomeFilter)
            }
          >
            <NativeSelectOption value="all">All outcomes</NativeSelectOption>
            <NativeSelectOption value="ok">Succeeded</NativeSelectOption>
            <NativeSelectOption value="error">Failed</NativeSelectOption>
          </NativeSelect>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        {audit.isPending ? (
          <div className="flex flex-col gap-2 px-4" aria-busy="true">
            {[0, 1, 2, 3, 4].map((key) => (
              <Skeleton key={key} className="h-11 w-full sm:h-9" />
            ))}
          </div>
        ) : audit.isError && !audit.data ? (
          <div className="px-4">
            <QueryError
              title="Activity could not be loaded"
              error={audit.error}
              onRetry={() => audit.refetch()}
            />
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            icon={<HistoryIcon />}
            title={
              all.length === 0
                ? "No activity yet"
                : outcome === "error"
                  ? "No failures"
                  : "Nothing matches"
            }
            description={
              all.length === 0
                ? "Changes made here, by schedules and from the command line appear in this list."
                : `Among the ${pluralize(all.length, "entry", "entries")} loaded so far.`
            }
            action={
              audit.hasNextPage ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={audit.isFetchingNextPage}
                  onClick={() => void audit.fetchNextPage()}
                >
                  {audit.isFetchingNextPage ? (
                    <Spinner data-icon="inline-start" />
                  ) : null}
                  Load older
                </Button>
              ) : null
            }
          />
        ) : (
          <StackedTable
            label="Activity"
            rows={entries}
            rowKey={(entry) => entry.id}
            columns={columns}
          />
        )}
      </CardContent>
      {entries.length > 0 &&
      (audit.hasNextPage || audit.isFetchNextPageError) ? (
        <div className="flex flex-col items-center gap-2 px-4">
          {audit.isFetchNextPageError ? (
            <p className="text-sm text-destructive">
              Older entries could not be loaded.
            </p>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={audit.isFetchingNextPage}
            onClick={() => void audit.fetchNextPage()}
          >
            {audit.isFetchingNextPage ? (
              <Spinner data-icon="inline-start" />
            ) : null}
            Load older
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
