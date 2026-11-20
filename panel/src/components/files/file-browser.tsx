import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  DownloadIcon,
  FileIcon,
  FolderIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "@zsrobinson/shell";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
} from "@zsrobinson/shell/ui/card";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@zsrobinson/shell/ui/table";

import { downloadUrl } from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";
import { useControlMutation } from "@/lib/mutations";
import { filesQuery } from "@/lib/queries";
import type { FileEntry } from "@/lib/types";
import { isSecretPath } from "@/lib/secret-files";
import { MAX_UPLOAD_BYTES, useUpload } from "@/lib/use-upload";
import { ConfirmAction } from "@zsrobinson/shell/blocks/confirm-action";
import { QueryError } from "@zsrobinson/shell/blocks/query-error";
import { UploadProgress } from "@zsrobinson/shell/blocks/upload-progress";
import { PathCrumbs } from "./path-crumbs";

const join = (dir: string, file: string) => (dir ? `${dir}/${file}` : file);

export function FileBrowser({ name, path }: { name: string; path: string }) {
  const listing = useQuery(filesQuery(name, path));
  const picker = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<File | null>(null);
  const upload = useUpload(
    "upload-file",
    name,
    (file) => `Uploaded ${file.name}`,
  );

  const entries = listing.data?.entries
    .filter((entry) => !isSecretPath(entry.path))
    .toSorted((a, b) =>
      a.type === b.type
        ? a.name.localeCompare(b.name)
        : a.type === "directory"
          ? -1
          : 1,
    );

  function send(file: File, overwrite: boolean) {
    return upload.mutateAsync({
      file,
      params: {
        path: join(path, file.name),
        confirm: overwrite ? "true" : undefined,
      },
    });
  }

  function pick(file: File | undefined) {
    if (picker.current) picker.current.value = "";
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("Files over 512 MiB cannot be uploaded here.");
      return;
    }
    if (entries?.some((entry) => entry.name === file.name)) setReplacing(file);
    else void send(file, false).catch(() => undefined);
  }

  return (
    <Card size="sm" className="gap-3">
      <CardHeader className="items-center">
        <div className="flex min-h-8 items-center">
          <PathCrumbs name={name} path={path} />
        </div>
        <CardAction>
          <input
            ref={picker}
            type="file"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => pick(event.target.files?.[0])}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={upload.isPending || !listing.data}
            onClick={() => picker.current?.click()}
          >
            <UploadIcon data-icon="inline-start" />
            Upload
          </Button>
        </CardAction>
      </CardHeader>
      {upload.isPending ? (
        <CardContent>
          <UploadProgress
            fraction={upload.progress}
            label={`Uploading ${upload.variables?.file.name ?? ""}`}
          />
        </CardContent>
      ) : null}
      <CardContent className="px-0">
        {listing.isPending ? (
          <div className="flex flex-col gap-2 px-4">
            {[0, 1, 2, 3].map((key) => (
              <Skeleton key={key} className="h-9 w-full" />
            ))}
          </div>
        ) : listing.isError ? (
          <div className="px-4">
            <QueryError
              title="This folder could not be opened"
              error={listing.error}
              onRetry={() => listing.refetch()}
            />
          </div>
        ) : entries && entries.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            This folder is empty
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 pl-4">Name</TableHead>
                <TableHead className="h-9 text-right max-sm:hidden">
                  Size
                </TableHead>
                <TableHead className="h-9 max-md:hidden">Modified</TableHead>
                <TableHead className="h-9 w-24 pr-4">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries?.map((entry) => (
                <EntryRow key={entry.path} name={name} entry={entry} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <ConfirmAction
        open={replacing !== null}
        onOpenChange={(open) => {
          if (!open) setReplacing(null);
        }}
        title={`Replace ${replacing?.name}?`}
        confirmLabel="Replace"
        destructive
        onConfirm={() => send(replacing!, true)}
      >
        A file with this name already exists in this folder.
      </ConfirmAction>
    </Card>
  );
}

function EntryRow({ name, entry }: { name: string; entry: FileEntry }) {
  const remove = useControlMutation<{ path: string; confirm: true }, unknown>(
    "delete-file",
    name,
    { success: `Deleted ${entry.name}` },
  );
  const directory = entry.type === "directory";
  const Icon = directory ? FolderIcon : FileIcon;

  return (
    <TableRow>
      <TableCell className="max-w-0 py-1.5 pl-4">
        <Link
          to="/servers/$name/files"
          params={{ name }}
          search={
            directory
              ? { path: entry.path }
              : { path: parentOf(entry.path), file: entry.path }
          }
          className="inline-flex max-w-full items-center gap-2 rounded-md font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{entry.name}</span>
        </Link>
      </TableCell>
      <TableCell className="text-right text-muted-foreground tabular-nums max-sm:hidden">
        {directory ? "—" : formatBytes(entry.bytes)}
      </TableCell>
      <TableCell className="text-muted-foreground max-md:hidden">
        {formatDateTime(entry.modifiedAt)}
      </TableCell>
      <TableCell className="py-1.5 pr-4">
        <div className="flex justify-end gap-1">
          {directory ? null : (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Download ${entry.name}`}
              render={
                <a
                  href={downloadUrl("download-file", name, {
                    path: entry.path,
                  })}
                  download
                />
              }
              nativeButton={false}
            >
              <DownloadIcon />
            </Button>
          )}
          <ConfirmAction
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${entry.name}`}
                disabled={remove.isPending}
              >
                <Trash2Icon />
              </Button>
            }
            title={`Delete ${entry.name}?`}
            confirmLabel="Delete"
            destructive
            onConfirm={() =>
              remove.mutateAsync({ path: entry.path, confirm: true })
            }
          >
            {directory
              ? "The folder and everything in it is deleted. This cannot be undone."
              : "The file is deleted. This cannot be undone."}
          </ConfirmAction>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function parentOf(path: string) {
  return path.split("/").slice(0, -1).join("/");
}
