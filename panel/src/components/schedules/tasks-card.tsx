import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { EllipsisIcon, PlayIcon, PlusIcon } from "lucide-react";
import { Badge } from "@zsrobinson/shell/ui/badge";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@zsrobinson/shell/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@zsrobinson/shell/ui/dropdown-menu";
import { Switch } from "@zsrobinson/shell/ui/switch";
import { ConfirmAction } from "@zsrobinson/shell/blocks/confirm-action";
import { RelativeTime } from "@zsrobinson/shell/blocks/relative-time";
import {
  StackedTable,
  type StackedColumn,
} from "@zsrobinson/shell/blocks/stacked-table";
import { useControlMutation } from "@/lib/mutations";
import {
  describeDays,
  describeTask,
  KIND_LABELS,
  utcToLocal,
  viewerIsUtc,
} from "@/lib/schedule";
import type { Task, TaskInput, Tasks } from "@/lib/types";

type Row = { global: true; time: string } | (Task & { global?: false });

/** The next daily occurrence of a UTC "HH:MM", for the shared nightly job. */
function nextDaily(hhmm: string, now = Date.now()) {
  const [h, m] = hhmm.split(":").map(Number);
  const day = Math.floor(now / 86_400_000) * 86_400_000;
  const today = day + (h * 60 + m) * 60_000;
  return today > now ? today : today + 86_400_000;
}

function When({ time }: { time: string }) {
  if (viewerIsUtc()) return <span className="tabular-nums">{time} UTC</span>;
  return (
    <span className="flex flex-col tabular-nums">
      <span>{utcToLocal(time)}</span>
      <span className="text-xs text-muted-foreground">{time} UTC</span>
    </span>
  );
}

/** One line on narrow screens: "10:00 PM (05:00 UTC)". */
function WhenInline({ time }: { time: string }) {
  return (
    <span className="tabular-nums">
      {viewerIsUtc() ? `${time} UTC` : `${utcToLocal(time)} (${time} UTC)`}
    </span>
  );
}

export function TasksCard({ name, data }: { name: string; data: Tasks }) {
  const [deleting, setDeleting] = useState<Task | null>(null);
  const save = useControlMutation<{ task: TaskInput }, Task>(
    "save-task",
    name,
    {
      success: (task) =>
        `${KIND_LABELS[task.kind]} ${task.enabled ? "enabled" : "paused"}`,
    },
  );
  const run = useControlMutation<{ id: string }, unknown>("run-task", name, {
    success: "Task ran",
  });
  const remove = useControlMutation<{ id: string; confirm: true }, unknown>(
    "delete-task",
    name,
    { success: "Task deleted" },
  );

  const rows: Row[] = [
    ...data.tasks.toSorted((a, b) => a.time.localeCompare(b.time)),
    ...(data.globalBackupAt
      ? [{ global: true as const, time: data.globalBackupAt }]
      : []),
  ];

  const columns: StackedColumn<Row>[] = [
    {
      id: "task",
      header: "Task",
      stack: "title",
      className: "whitespace-normal",
      cell: (row) =>
        row.global ? (
          <span className="flex flex-col">
            <span className="font-medium">Nightly backup</span>
            <span className="text-xs font-normal text-muted-foreground">
              Every server · set by the host
            </span>
          </span>
        ) : (
          <span className="flex min-w-0 flex-col">
            <Link
              to="/servers/$name/schedules/$id"
              params={{ name, id: row.id }}
              className="w-fit rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {KIND_LABELS[row.kind]}
            </Link>
            <span
              className={
                row.kind === "command"
                  ? "truncate font-mono text-xs font-normal text-muted-foreground"
                  : "line-clamp-2 text-xs font-normal text-muted-foreground"
              }
            >
              {describeTask(row)}
            </span>
          </span>
        ),
    },
    {
      id: "time",
      header: "Time",
      stack: "detail",
      className: "whitespace-nowrap",
      cell: (row) => (
        <>
          <span className="max-sm:hidden">
            <When time={row.time} />
          </span>
          <span className="sm:hidden">
            <WhenInline time={row.time} />
          </span>
        </>
      ),
    },
    {
      id: "days",
      header: "Days",
      stack: "detail",
      className: "whitespace-nowrap",
      cell: (row) => describeDays(row.global ? [] : row.days),
    },
    {
      id: "next",
      header: "Next run",
      stack: "detail",
      className: "whitespace-nowrap",
      cell: (row) => {
        const next = row.global ? nextDaily(row.time) : row.nextRun;
        return next ? (
          <span>
            <span className="sm:hidden">Next: </span>
            <RelativeTime value={next} />
          </span>
        ) : (
          <span className="text-muted-foreground">Paused</span>
        );
      },
    },
    {
      id: "last",
      header: "Last run",
      stack: "detail",
      className: "whitespace-nowrap",
      cell: (row) =>
        row.global ? (
          <span className="text-muted-foreground">See Backups</span>
        ) : row.lastRun ? (
          <span
            className="inline-flex items-center gap-1.5"
            title={row.lastRun.error}
          >
            <Badge variant={row.lastRun.ok ? "positive" : "destructive"}>
              {row.lastRun.ok ? "Succeeded" : "Failed"}
            </Badge>
            <RelativeTime value={row.lastRun.at} />
          </span>
        ) : (
          <span className="text-muted-foreground">Not yet</span>
        ),
    },
    {
      id: "enabled",
      header: "Enabled",
      stack: "end",
      className: "w-20",
      cell: (row) =>
        row.global ? (
          <span className="text-xs text-muted-foreground">Always</span>
        ) : (
          <Switch
            aria-label={`${KIND_LABELS[row.kind]} at ${row.time} UTC enabled`}
            checked={row.enabled}
            disabled={save.isPending && save.variables?.task.id === row.id}
            onCheckedChange={(enabled) =>
              save.mutate({ task: { ...toInput(row), enabled } })
            }
          />
        ),
    },
    {
      id: "actions",
      header: "Actions",
      hideHeader: true,
      stack: "end",
      className: "w-10",
      cell: (row) =>
        row.global ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${KIND_LABELS[row.kind]} at ${row.time} UTC actions`}
                />
              }
            >
              <EllipsisIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                render={
                  <Link
                    to="/servers/$name/schedules/$id"
                    params={{ name, id: row.id }}
                  />
                }
              >
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={run.isPending}
                onClick={() => run.mutate({ id: row.id })}
              >
                <PlayIcon />
                Run now
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setDeleting(row)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex min-h-8 items-center">Tasks</CardTitle>
        <CardDescription>
          Tasks run on UTC days and times
          {viewerIsUtc() ? "." : ", shown here in your local time too."}
        </CardDescription>
        <CardAction>
          <Button
            size="sm"
            render={
              <Link to="/servers/$name/schedules/new" params={{ name }} />
            }
            nativeButton={false}
          >
            <PlusIcon data-icon="inline-start" />
            New task
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <StackedTable
          label="Scheduled tasks"
          rows={rows}
          rowKey={(row) => (row.global ? "global-backup" : row.id)}
          columns={columns}
          rowClassName={(row) =>
            row.global || row.enabled ? undefined : "text-muted-foreground"
          }
        />
        {data.tasks.length === 0 ? (
          <p className="px-4 pt-4 text-sm text-muted-foreground">
            No tasks of its own yet. Restarts, extra backups, console commands
            and announcements can run on a schedule.
          </p>
        ) : null}
      </CardContent>
      <ConfirmAction
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete this ${deleting ? KIND_LABELS[deleting.kind].toLowerCase() : "task"}?`}
        confirmLabel="Delete task"
        destructive
        onConfirm={async () => {
          if (deleting)
            await remove.mutateAsync({ id: deleting.id, confirm: true });
        }}
      >
        It stops running. Its history stays in Activity.
      </ConfirmAction>
    </Card>
  );
}

export function toInput(task: Task): TaskInput {
  return {
    id: task.id,
    kind: task.kind,
    time: task.time,
    days: task.days,
    enabled: task.enabled,
    ...(task.kind === "command" ? { command: task.command } : {}),
    ...(task.kind === "announce" ? { message: task.message } : {}),
    ...(task.kind === "restart" ? { warnMinutes: task.warnMinutes ?? 0 } : {}),
  };
}
