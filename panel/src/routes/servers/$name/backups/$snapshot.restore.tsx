import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FormStack, PageHeader, PageTitle, toast } from "@zsrobinson/shell";
import { Button } from "@zsrobinson/shell/ui/button";
import { Card, CardContent } from "@zsrobinson/shell/ui/card";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";
import { DetailList, DetailRow } from "@zsrobinson/shell/blocks/detail-list";
import { EmptyState } from "@zsrobinson/shell/blocks/empty-state";
import { QueryError } from "@zsrobinson/shell/blocks/query-error";
import { RelativeTime } from "@zsrobinson/shell/blocks/relative-time";
import { TypedConfirm } from "@zsrobinson/shell/blocks/typed-confirm";
import { BackupFirstNote } from "@/components/backup-first-note";
import { control } from "@/lib/api";
import { formatBytes, formatDateTime, locationLabel } from "@/lib/format";
import { withIntent } from "@/lib/intent";
import { refreshServer } from "@/lib/mutations";
import { backupsQuery } from "@/lib/queries";

export const Route = createFileRoute(
  "/servers/$name/backups/$snapshot/restore",
)({
  staticData: {
    crumb: "Restore",
    parentCrumb: { label: "Backups", to: "/servers/$name/backups" },
  },
  loader: ({ context: { queryClient }, params }) => {
    void queryClient.prefetchQuery(backupsQuery(params.name));
  },
  component: RestorePage,
});

function RestorePage() {
  const { name, snapshot } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const backups = useQuery(backupsQuery(name));
  const backup = backups.data?.find((item) => item.id === snapshot);
  const back = (
    <Button
      variant="outline"
      render={<Link to="/servers/$name/backups" params={{ name }} />}
      nativeButton={false}
    >
      Cancel
    </Button>
  );

  return (
    <FormStack>
      <PageHeader>
        <PageTitle>Restore backup</PageTitle>
      </PageHeader>
      {backups.isPending ? (
        <Card aria-busy="true">
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      ) : backups.isError ? (
        <QueryError
          title="Backups could not be listed"
          error={backups.error}
          onRetry={() => backups.refetch()}
        />
      ) : !backup ? (
        <Card>
          <CardContent>
            <EmptyState
              title="Snapshot not found"
              description="It may have been pruned by retention."
              action={back}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card size="sm">
            <CardContent>
              <DetailList>
                <DetailRow label="Snapshot">
                  <span className="truncate font-mono text-xs">
                    {backup.id}
                  </span>
                </DetailRow>
                <DetailRow label="Created">
                  <span className="flex flex-col items-end">
                    <span>{formatDateTime(backup.createdAt)}</span>
                    <RelativeTime
                      value={backup.createdAt}
                      className="text-xs font-normal text-muted-foreground"
                    />
                  </span>
                </DetailRow>
                <DetailRow label="Size">{formatBytes(backup.bytes)}</DetailRow>
                {backup.reason ? (
                  <DetailRow label="Reason">{backup.reason}</DetailRow>
                ) : null}
                <DetailRow label="Stored on">
                  {backup.locations?.length
                    ? backup.locations.map(locationLabel).join(", ")
                    : backup.replicated
                      ? "All destinations"
                      : "Primary only"}
                </DetailRow>
              </DetailList>
            </CardContent>
          </Card>
          <TypedConfirm
            title={`Restore ${name} to ${formatDateTime(backup.createdAt)}`}
            typedName={name}
            consequences={[
              "The server stops and disconnects everyone online.",
              "The world, settings and mods return to this snapshot; anything newer leaves the live server.",
              "Checksums are verified before anything is replaced.",
              "The server starts again when the restore finishes.",
            ]}
            safeguards={
              <BackupFirstNote>
                The current state is saved as a pinned snapshot first, so this
                restore can be undone from Backups.
              </BackupFirstNote>
            }
            confirmLabel="Restore backup"
            pendingLabel="Backing up and restoring"
            cancel={back}
            onConfirm={async () => {
              try {
                await withIntent(name, "restore-backup", (intent) =>
                  control("restore-backup", name, {
                    snapshot: backup.id,
                    confirm: true,
                    confirmName: name,
                    intent,
                  }),
                );
              } finally {
                void refreshServer(queryClient, name);
              }
              toast.success("Backup restored");
              await navigate({
                to: "/servers/$name/backups",
                params: { name },
              });
            }}
          />
        </>
      )}
    </FormStack>
  );
}
