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
import { pluralize } from "@/lib/format";
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
    <Card size="sm" className="gap-3">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex min-h-8 items-center whitespace-nowrap">
          Backups
          {backups.data ? (
            <span className="ml-2 font-normal text-muted-foreground">
              {pluralize(backups.data.length, "snapshot")}
            </span>
          ) : null}
        </CardTitle>
        <CardAction className="flex gap-2">
          {backups.data?.length ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={restoreTest.isPending}
                onClick={() => restoreTest.mutate({})}
              >
                {restoreTest.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : null}
                Test restore
              </Button>
              {backUpButton}
            </>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        {backups.isPending ? (
          <div className="flex flex-col gap-2 px-4">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-11 w-full" />
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
  );
}
