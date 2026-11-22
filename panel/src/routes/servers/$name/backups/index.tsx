import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArchiveIcon, ChevronRightIcon } from "lucide-react";
import {
  PageStack,
  PageHeader,
  PageTitle,
  PageActions,
} from "@zsrobinson/shell";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@zsrobinson/shell/ui/card";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";
import { Spinner } from "@zsrobinson/shell/ui/spinner";
import { BarChartCard } from "@zsrobinson/shell/blocks/chart-card";
import { DetailList, DetailRow } from "@zsrobinson/shell/blocks/detail-list";
import { EmptyState } from "@zsrobinson/shell/blocks/empty-state";
import { QueryError } from "@zsrobinson/shell/blocks/query-error";
import { BackupsTable } from "@/components/backups/backups-table";
import { formatBytes, parseTime } from "@/lib/format";
import { serverColor } from "@/lib/history";
import { useControlMutation } from "@/lib/mutations";
import { backupsQuery, tasksQuery } from "@/lib/queries";
import { describeDays, utcToLocal, viewerIsUtc } from "@/lib/schedule";

export const Route = createFileRoute("/servers/$name/backups/")({
  staticData: { crumb: "Backups" },
  loader: ({ context: { queryClient }, params }) => {
    void queryClient.prefetchQuery(backupsQuery(params.name));
  },
  component: BackupsPage,
});

const at = (hhmm: string) =>
  viewerIsUtc() ? `${hhmm} UTC` : `${utcToLocal(hhmm)} (${hhmm} UTC)`;

function BackupsPage() {
  const { name } = Route.useParams();
  const backups = useQuery(backupsQuery(name));
  const tasks = useQuery(tasksQuery(name));
  const backup = useControlMutation<void, { snapshot: string }>(
    "backup-now",
    name,
    { success: "Backup saved to every destination" },
  );
  const restoreTest = useControlMutation<{ snapshot?: string }, unknown>(
    "restore-test",
    name,
    { success: "Restore test passed" },
  );
  const backUpButton = (
    <Button
      size="sm"
      disabled={backup.isPending}
      onClick={() => backup.mutate()}
    >
      {backup.isPending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <ArchiveIcon data-icon="inline-start" />
      )}
      {backup.isPending ? "Backing up" : "Back up now"}
    </Button>
  );
  const scheduled = tasks.data?.tasks.filter(
    (task) => task.kind === "backup" && task.enabled,
  );

  return (
    <PageStack>
      <PageHeader>
        <PageTitle>Backups</PageTitle>
        <PageActions>{backUpButton}</PageActions>
      </PageHeader>
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex min-h-8 items-center whitespace-nowrap">
            Snapshots
            {backups.data ? (
              <span className="ml-2 font-normal text-muted-foreground">
                {backups.data.length}
              </span>
            ) : null}
          </CardTitle>
          <CardAction className="flex gap-2">
            {backups.data?.length ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={restoreTest.isPending}
                onClick={() => restoreTest.mutate({})}
              >
                {restoreTest.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : null}
                Test restore
              </Button>
            ) : null}
          </CardAction>
        </CardHeader>
        <CardContent>
          {backups.isPending ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              {[0, 1, 2].map((key) => (
                <Skeleton key={key} className="h-11 w-full sm:h-9" />
              ))}
            </div>
          ) : backups.isError ? (
            <QueryError
              title="Backups could not be listed"
              error={backups.error}
              onRetry={() => backups.refetch()}
            />
          ) : backups.data.length === 0 ? (
            <EmptyState
              icon={<ArchiveIcon />}
              title="No backups yet"
              description="The nightly backup will take the first one, or take one now."
              action={backUpButton}
            />
          ) : (
            <BackupsTable name={name} backups={backups.data} />
          )}
        </CardContent>
      </Card>
      {backups.data?.length ? (
        <BarChartCard
          title="Backup size"
          label="Snapshot sizes over time"
          data={backups.data
            .map((b) => ({ time: parseTime(b.createdAt), bytes: b.bytes }))
            .filter((point) => Number.isFinite(point.time))
            .sort((a, b) => a.time - b.time)}
          config={{ bytes: { label: name, color: serverColor(name) } }}
          format={formatBytes}
          emptyMessage="No data yet"
        />
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="flex min-h-8 items-center">
            Automatic backups
          </CardTitle>
          <CardAction>
            <Button
              size="sm"
              variant="ghost"
              render={<Link to="/servers/$name/schedules" params={{ name }} />}
              nativeButton={false}
            >
              Schedules
              <ChevronRightIcon data-icon="inline-end" />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {tasks.isPending ? (
            <Skeleton className="h-9 w-full" />
          ) : tasks.isError ? (
            <p className="text-sm text-muted-foreground">
              The schedule could not be loaded.
            </p>
          ) : (
            <DetailList>
              <DetailRow label="Nightly, all servers">
                {tasks.data.globalBackupAt
                  ? at(tasks.data.globalBackupAt)
                  : "Off"}
              </DetailRow>
              {scheduled?.map((task) => (
                <DetailRow key={task.id} label={describeDays(task.days)}>
                  {at(task.time)}
                </DetailRow>
              ))}
            </DetailList>
          )}
        </CardContent>
      </Card>
    </PageStack>
  );
}
