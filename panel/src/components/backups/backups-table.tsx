import { useState } from "react";
import { DownloadIcon, EllipsisIcon, PinIcon } from "lucide-react";
import { Button } from "@zsrobinson/shell/ui/button";
import { Badge } from "@zsrobinson/shell/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@zsrobinson/shell/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@zsrobinson/shell/ui/dropdown-menu";
import { ConfirmAction } from "@zsrobinson/shell/blocks/confirm-action";
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
export function BackupsTable({
  name,
  backups,
}: {
  name: string;
  backups: Backup[];
}) {
  const [selected, setSelected] = useState<Backup | null>(null);
  const restore = useControlMutation<
    { snapshot: string; confirm: true; confirmName: string },
    unknown
  >("restore-backup", name, { success: "Backup restored" });
  const pin = useControlMutation<
    { snapshot: string; pinned: boolean },
    unknown
  >("pin-backup", name, { success: "Backup pin updated" });
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Created</TableHead>
            <TableHead className="max-sm:hidden">Stored on</TableHead>
            <TableHead className="text-right">Size</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {backups
            .toSorted((a, b) => parseTime(b.createdAt) - parseTime(a.createdAt))
            .map((backup) => (
              <TableRow key={backup.id}>
                <TableCell className="w-full whitespace-normal">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {formatDateTime(backup.createdAt)}
                    </span>
                    {backup.pinned ? (
                      <PinIcon
                        className="size-3 shrink-0"
                        aria-label="Pinned"
                      />
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatRelative(backup.createdAt)}
                    {backup.reason ? ` · ${backup.reason}` : ""}
                  </div>
                </TableCell>
                <TableCell className="max-sm:hidden">
                  <div className="flex gap-1">
                    {backup.locations?.length ? (
                      backup.locations.map((l) => (
                        <Badge key={l} variant="outline">
                          {locationLabel(l)}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant="outline">
                        {backup.replicated
                          ? "All destinations"
                          : "Primary only"}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right text-xs tabular-nums whitespace-nowrap">
                  {formatBytes(backup.bytes)}
                </TableCell>
                <TableCell>
                  <div className="flex">
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
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Backup actions"
                          />
                        }
                      >
                        <EllipsisIcon />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={restore.isPending}
                          onClick={() => setSelected(backup)}
                        >
                          Restore
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={pin.isPending}
                          onClick={() =>
                            pin.mutate({
                              snapshot: backup.id,
                              pinned: !backup.pinned,
                            })
                          }
                        >
                          {backup.pinned ? "Unpin" : "Pin"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
      <ConfirmAction
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
        title="Restore this backup?"
        confirmLabel="Restore backup"
        destructive
        typedName={name}
        onConfirm={async () => {
          if (selected)
            await restore.mutateAsync({
              snapshot: selected.id,
              confirm: true,
              confirmName: name,
            });
          setSelected(null);
        }}
      >
        The current state is backed up first. The server stops and returns to{" "}
        {selected ? formatDateTime(selected.createdAt) : "this snapshot"}.
      </ConfirmAction>
    </>
  );
}
