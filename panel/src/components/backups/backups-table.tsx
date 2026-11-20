import { DownloadIcon, RotateCcwIcon } from "lucide-react";
import { Badge } from "@zsrobinson/shell/ui/badge";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@zsrobinson/shell/ui/table";

import { downloadUrl } from "@/lib/api";
import {
  formatBytes,
  formatDateTime,
  formatRelative,
  locationLabel,
  parseTime,
} from "@/lib/format";
import { useControlMutation } from "@/lib/mutations";
import type { Backup } from "@/lib/types";
import { ConfirmAction } from "@zsrobinson/shell/blocks/confirm-action";

export function BackupsTable({
  name,
  backups,
}: {
  name: string;
  backups: Backup[];
}) {
  const restore = useControlMutation<
    { snapshot: string; confirm: true; confirmName: string },
    unknown
  >("restore-backup", name, { success: "Backup restored" });
  const sorted = backups.toSorted(
    (a, b) => parseTime(b.createdAt) - parseTime(a.createdAt),
  );

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="h-9 pl-4">Created</TableHead>
          <TableHead className="h-9 text-right">Size</TableHead>
          <TableHead className="h-9 max-sm:hidden">Stored on</TableHead>
          <TableHead className="h-9 pr-4">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((backup) => (
          <TableRow key={backup.id}>
            <TableCell className="pl-4">
              <div className="flex flex-col">
                <span className="font-medium">
                  {formatDateTime(backup.createdAt)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatRelative(backup.createdAt)}
                  {backup.reason ? ` · ${backup.reason}` : null}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatBytes(backup.bytes)}
            </TableCell>
            <TableCell className="max-sm:hidden">
              <Locations backup={backup} />
            </TableCell>
            <TableCell className="pr-4">
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Download backup"
                  render={
                    <a
                      href={downloadUrl("download-backup", name, {
                        snapshot: backup.id,
                      })}
                      download
                    />
                  }
                  nativeButton={false}
                >
                  <DownloadIcon />
                </Button>
                <ConfirmAction
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label="Restore backup"
                      className="max-sm:size-8 max-sm:px-0"
                      disabled={restore.isPending}
                    >
                      <RotateCcwIcon className="sm:hidden" />
                      <span className="max-sm:sr-only">Restore</span>
                    </Button>
                  }
                  title="Restore this backup?"
                  confirmLabel="Restore backup"
                  destructive
                  typedName={name}
                  onConfirm={() =>
                    restore.mutateAsync({
                      snapshot: backup.id,
                      confirm: true,
                      confirmName: name,
                    })
                  }
                >
                  The server stops and its world and settings return to{" "}
                  {formatDateTime(backup.createdAt)}. The current state is
                  backed up first.
                </ConfirmAction>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function Locations({ backup }: { backup: Backup }) {
  return (
    <div className="flex flex-wrap gap-1">
      {backup.locations?.length ? (
        backup.locations.map((location) => (
          <Badge key={location} variant="outline">
            {locationLabel(location)}
          </Badge>
        ))
      ) : backup.replicated ? (
        <Badge variant="outline">All destinations</Badge>
      ) : (
        <Badge variant="destructive">Primary only</Badge>
      )}
      {backup.pinned ? (
        <Badge
          variant="secondary"
          title="Kept outside the normal retention schedule"
        >
          Pinned
        </Badge>
      ) : null}
    </div>
  );
}
