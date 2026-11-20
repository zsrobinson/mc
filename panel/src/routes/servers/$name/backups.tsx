import { BarChartCard } from "@zsrobinson/shell/blocks/chart-card";
import { serverColor } from "@/lib/history";
import {
  PageStack,
  PageHeader,
  PageTitle,
  PageActions,
} from "@zsrobinson/shell";
import { ScheduleCard } from "@/components/settings/schedule-card";
import { useServer } from "@/lib/use-server";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@zsrobinson/shell/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyTitle,
} from "@zsrobinson/shell/ui/empty";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";
import { Spinner } from "@zsrobinson/shell/ui/spinner";

import { BackupsTable } from "@/components/backups/backups-table";
import { QueryError } from "@zsrobinson/shell/blocks/query-error";
import { useControlMutation } from "@/lib/mutations";
import { backupsQuery } from "@/lib/queries";

export const Route = createFileRoute("/servers/$name/backups")({
  staticData: { crumb: "Backups" },
  loader: ({ context: { queryClient }, params }) => {
    void queryClient.prefetchQuery(backupsQuery(params.name));
  },
  component: BackupsPage,
});

function BackupsPage() {
  const { name } = Route.useParams();
  const backups = useQuery(backupsQuery(name));
  const server = useServer(name);
  const backup = useControlMutation<void, { snapshot: string }>(
    "backup-now",
    name,
    {
      success: "Backup saved to every destination",
    },
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
      {backup.isPending ? <Spinner data-icon="inline-start" /> : null}
      {backup.isPending ? "Backing up" : "Back up now"}
    </Button>
  );

  return (
    <PageStack>
      <PageHeader>
        <PageTitle>Backups</PageTitle>
        <PageActions>{backUpButton}</PageActions>
      </PageHeader>
      <BarChartCard
        title="Backup size"
        label="Snapshot sizes over time"
        loading={backups.isPending}
        data={(backups.data ?? [])
          .map((b) => ({
            time: Date.parse(b.createdAt) / 1000,
            bytes: b.bytes,
          }))
          .sort((a, b) => a.time - b.time)}
        config={{ bytes: { label: name, color: serverColor(name) } }}
        format={(n) => `${(n / 1048576).toFixed(0)} MiB`}
      />
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
              <>
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
              </>
            ) : null}
          </CardAction>
        </CardHeader>
        <CardContent>
          {backups.isPending ? (
            <div className="flex flex-col gap-2 px-4">
              {[0, 1, 2].map((key) => (
                <Skeleton key={key} className="h-11 sm:h-9 w-full" />
              ))}
            </div>
          ) : backups.isError ? (
            <div className="px-4">
              <QueryError
                title="Backups could not be listed"
                error={backups.error}
                onRetry={() => backups.refetch()}
              />
            </div>
          ) : backups.data.length === 0 ? (
            <Empty className="py-10">
              <EmptyHeader>
                <EmptyTitle className="text-base">No backups yet</EmptyTitle>
              </EmptyHeader>
              <EmptyContent>{backUpButton}</EmptyContent>
            </Empty>
          ) : (
            <BackupsTable name={name} backups={backups.data} />
          )}
        </CardContent>
      </Card>
      {server.data ? (
        <ScheduleCard
          key={`${server.data.schedule?.backupAt}:${server.data.schedule?.restartAt}`}
          server={server.data}
          kind="backup"
        />
      ) : null}
    </PageStack>
  );
}
