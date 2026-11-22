import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  DownloadIcon,
  EllipsisIcon,
  FileArchiveIcon,
  FileIcon,
  FileTextIcon,
  FolderIcon,
  FolderPlusIcon,
  UploadIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { PageActions, PageHeader, PageTitle, toast } from "@zsrobinson/shell";
import { Button } from "@zsrobinson/shell/ui/button";
import { Card, CardContent, CardHeader } from "@zsrobinson/shell/ui/card";
import { Checkbox } from "@zsrobinson/shell/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@zsrobinson/shell/ui/dropdown-menu";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";
import { Spinner } from "@zsrobinson/shell/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@zsrobinson/shell/ui/table";
import { ConfirmAction } from "@zsrobinson/shell/blocks/confirm-action";
import { EmptyState } from "@zsrobinson/shell/blocks/empty-state";
import { PromptAction } from "@zsrobinson/shell/blocks/prompt-action";
import { QueryError } from "@zsrobinson/shell/blocks/query-error";
import { UploadProgress } from "@zsrobinson/shell/blocks/upload-progress";

import { downloadUrl } from "@/lib/api";
import { formatBytes, formatDateTime, pluralize } from "@/lib/format";
import { useControlMutation } from "@/lib/mutations";
import { filesQuery } from "@/lib/queries";
import type { FileEntry } from "@/lib/types";
import { isSecretPath } from "@/lib/secret-files";
import { MAX_UPLOAD_BYTES, useUpload } from "@/lib/use-upload";
import { PathCrumbs } from "./path-crumbs";

const join = (dir: string, file: string) => (dir ? `${dir}/${file}` : file);
const stem = (name: string) => name.replace(/\.[^.]+$/, "") || name;

export function parentOf(path: string) {
  return path.split("/").slice(0, -1).join("/");
}

/** Older helpers do not say; let the editor decide, as before. */
const isEditable = (entry: FileEntry) =>
  entry.type === "file" && entry.editable !== false;
const isArchive = (entry: FileEntry) =>
  entry.type === "file" &&
  (entry.archive ?? entry.name.toLowerCase().endsWith(".zip"));

/** A plain name in the current folder: no slashes, no dot segments. */
function nameError(value: string, taken: string[], current?: string) {
  if (!value) return "Enter a name";
  if (value.includes("/")) return "Use a name without slashes";
  if (value === "." || value === "..") return "Choose another name";
  if (isSecretPath(value)) return "That name is reserved";
  if (value !== current && taken.includes(value))
    return "Something with that name is already here";
  return null;
}

type Pending =
  | { kind: "rename" | "extract" | "delete"; entry: FileEntry }
  | { kind: "compress" }
  | { kind: "folder" };

export function FileBrowser({ name, path }: { name: string; path: string }) {
  const listing = useQuery(filesQuery(name, path));
  const picker = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<File | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [pending, setPending] = useState<Pending | null>(null);
  const close = () => setPending(null);
  const upload = useUpload(
    "upload-file",
    name,
    (file) => `Uploaded ${file.name}`,
  );
  const makeDirectory = useControlMutation<{ path: string }, { path: string }>(
    "make-directory",
    name,
    { success: (result) => `Created ${result.path.split("/").at(-1)}` },
  );
  const rename = useControlMutation<
    { from: string; to: string },
    { path: string }
  >("rename-file", name, {
    success: (result) => `Renamed to ${result.path.split("/").at(-1)}`,
  });
  const archive = useControlMutation<
    { paths: string[]; destination: string },
    { path: string; entries: number; bytes: number }
  >("archive-files", name, {
    success: (result) =>
      `Compressed ${pluralize(result.entries, "item")} into ${result.path.split("/").at(-1)}`,
    onSuccess: () => setSelected(new Set()),
  });
  const extract = useControlMutation<
    { path: string; destination: string },
    { destination: string; entries: number }
  >("extract-archive", name, {
    success: (result) =>
      `Extracted ${pluralize(result.entries, "item")} into ${result.destination || "data"}`,
  });
  const remove = useControlMutation<{ path: string; confirm: true }, unknown>(
    "delete-file",
    name,
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
  const names = entries?.map((entry) => entry.name) ?? [];
  const chosen = entries?.filter((entry) => selected.has(entry.path)) ?? [];
  const allChosen = !!entries?.length && chosen.length === entries.length;
  const busy = archive.isPending || extract.isPending;

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

  function toggle(entry: FileEntry, on: boolean) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (on) next.add(entry.path);
      else next.delete(entry.path);
      return next;
    });
  }

  function archiveName() {
    const base = chosen.length === 1 ? stem(chosen[0].name) : "archive";
    let candidate = `${base}.zip`;
    for (let n = 2; names.includes(candidate); n++)
      candidate = `${base}-${n}.zip`;
    return candidate;
  }

  return (
    <>
      <PageHeader>
        <PageTitle>Files</PageTitle>
        <PageActions>
          <Button
            variant="outline"
            size="sm"
            disabled={!listing.data}
            onClick={() => setPending({ kind: "folder" })}
          >
            <FolderPlusIcon data-icon="inline-start" />
            New folder
          </Button>
          <input
            ref={picker}
            type="file"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => pick(event.target.files?.[0])}
          />
          <Button
            size="sm"
            disabled={upload.isPending || !listing.data}
            onClick={() => picker.current?.click()}
          >
            <UploadIcon data-icon="inline-start" />
            Upload
          </Button>
        </PageActions>
      </PageHeader>
      <Card>
        <CardHeader className="flex min-h-8 flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex min-h-8 min-w-0 flex-1 items-center">
            <PathCrumbs name={name} path={path} />
          </div>
          {chosen.length ? (
            <div
              role="toolbar"
              aria-label="Selected items"
              className="flex flex-wrap items-center gap-2"
            >
              <span className="text-sm text-muted-foreground tabular-nums">
                {pluralize(chosen.length, "item")} selected
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => setPending({ kind: "compress" })}
              >
                {archive.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <FileArchiveIcon data-icon="inline-start" />
                )}
                Compress to .zip
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
            </div>
          ) : null}
        </CardHeader>
        {upload.isPending || extract.isPending ? (
          <CardContent>
            {upload.isPending ? (
              <UploadProgress
                fraction={upload.progress}
                label={`Uploading ${upload.variables?.file.name ?? ""}`}
              />
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner /> Extracting{" "}
                {extract.variables?.path.split("/").at(-1)}
              </p>
            )}
          </CardContent>
        ) : null}
        <CardContent className="px-0">
          {listing.isPending ? (
            <div className="flex flex-col gap-2 px-4" aria-busy="true">
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
            <EmptyState
              icon={<FolderIcon />}
              title="This folder is empty"
              description="Upload a file or create a folder here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10 pl-4">
                    <Checkbox
                      aria-label="Select everything in this folder"
                      checked={allChosen}
                      indeterminate={chosen.length > 0 && !allChosen}
                      onCheckedChange={(on) =>
                        setSelected(
                          on
                            ? new Set(entries?.map((entry) => entry.path))
                            : new Set(),
                        )
                      }
                    />
                  </TableHead>
                  <TableHead className="w-full">Name</TableHead>
                  <TableHead className="text-right max-sm:hidden">
                    Size
                  </TableHead>
                  <TableHead className="max-md:hidden">Modified</TableHead>
                  <TableHead className="w-20 pr-4">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries?.map((entry) => (
                  <EntryRow
                    key={entry.path}
                    name={name}
                    entry={entry}
                    selected={selected.has(entry.path)}
                    onSelect={(on) => toggle(entry, on)}
                    onAction={(kind) => setPending({ kind, entry })}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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

      <PromptAction
        open={pending?.kind === "folder"}
        onOpenChange={(open) => !open && close()}
        title="New folder"
        label="Folder name"
        hint={`Created in ${path || "data"}.`}
        validate={(value) => nameError(value, names)}
        confirmLabel="Create folder"
        onConfirm={(value) =>
          makeDirectory.mutateAsync({ path: join(path, value) })
        }
      />

      <PromptAction
        open={pending?.kind === "rename"}
        onOpenChange={(open) => !open && close()}
        title={
          pending?.kind === "rename" ? `Rename ${pending.entry.name}` : "Rename"
        }
        label="New name"
        initialValue={pending?.kind === "rename" ? pending.entry.name : ""}
        selectStem={pending?.kind === "rename" && pending.entry.type === "file"}
        validate={(value) =>
          pending?.kind === "rename"
            ? value === pending.entry.name
              ? "Enter a different name"
              : nameError(value, names, pending.entry.name)
            : null
        }
        confirmLabel="Rename"
        onConfirm={async (value) => {
          if (pending?.kind !== "rename") return;
          await rename.mutateAsync({
            from: pending.entry.path,
            to: join(path, value),
          });
          setSelected(new Set());
        }}
      />

      <PromptAction
        open={pending?.kind === "compress"}
        onOpenChange={(open) => !open && close()}
        title={`Compress ${pluralize(chosen.length, "item")}`}
        description={
          chosen.length <= 3
            ? chosen.map((entry) => entry.name).join(", ")
            : `${chosen
                .slice(0, 3)
                .map((entry) => entry.name)
                .join(", ")} and ${chosen.length - 3} more`
        }
        label="Archive name"
        hint={`Saved in ${path || "data"}. Secret files and links are left out.`}
        initialValue={archiveName()}
        selectStem
        validate={(value) =>
          !value.toLowerCase().endsWith(".zip")
            ? "End the name with .zip"
            : nameError(value, names)
        }
        confirmLabel="Compress"
        onConfirm={(value) =>
          archive.mutateAsync({
            paths: chosen.map((entry) => entry.path),
            destination: join(path, value),
          })
        }
      />

      <PromptAction
        open={pending?.kind === "extract"}
        onOpenChange={(open) => !open && close()}
        title={
          pending?.kind === "extract"
            ? `Extract ${pending.entry.name}`
            : "Extract"
        }
        label="Into folder"
        hint="Path inside the data folder. It is created if missing; existing files are never overwritten."
        initialValue={
          pending?.kind === "extract"
            ? join(path, stem(pending.entry.name))
            : ""
        }
        validate={(value) => {
          const clean = value.replace(/^\/+|\/+$/g, "");
          if (clean.split("/").some((part) => part === ".." || part === "."))
            return "Use a path inside the data folder";
          if (clean === "world" || clean.startsWith("world/"))
            return "Archives cannot be extracted into world/";
          return null;
        }}
        confirmLabel="Extract"
        onConfirm={(value) =>
          pending?.kind === "extract"
            ? extract.mutateAsync({
                path: pending.entry.path,
                destination: value.replace(/^\/+|\/+$/g, ""),
              })
            : Promise.resolve()
        }
      />

      <ConfirmAction
        open={pending?.kind === "delete"}
        onOpenChange={(open) => !open && close()}
        title={
          pending?.kind === "delete" ? `Delete ${pending.entry.name}?` : ""
        }
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (pending?.kind !== "delete") return;
          await remove.mutateAsync({ path: pending.entry.path, confirm: true });
          toast.success(`Deleted ${pending.entry.name}`);
          toggle(pending.entry, false);
        }}
      >
        {pending?.kind === "delete" && pending.entry.type === "directory"
          ? "The folder and everything in it is deleted. This cannot be undone."
          : "The file is deleted. This cannot be undone."}
      </ConfirmAction>
    </>
  );
}

function EntryRow({
  name,
  entry,
  selected,
  onSelect,
  onAction,
}: {
  name: string;
  entry: FileEntry;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onAction: (kind: "rename" | "extract" | "delete") => void;
}) {
  const directory = entry.type === "directory";
  const editable = isEditable(entry);
  const zip = isArchive(entry);
  const Icon = directory
    ? FolderIcon
    : zip
      ? FileArchiveIcon
      : editable && entry.editable
        ? FileTextIcon
        : FileIcon;
  const download = downloadUrl("download-file", name, { path: entry.path });
  const label =
    "inline-flex max-w-full items-center gap-2 rounded-md font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <TableRow data-state={selected ? "selected" : undefined}>
      <TableCell className="w-10 py-1.5 pl-4">
        <Checkbox
          aria-label={`Select ${entry.name}`}
          checked={selected}
          onCheckedChange={(on) => onSelect(on)}
        />
      </TableCell>
      <TableCell className="max-w-0 py-1.5">
        {directory || editable ? (
          <Link
            to="/servers/$name/files"
            params={{ name }}
            search={
              directory
                ? { path: entry.path }
                : { path: parentOf(entry.path), file: entry.path }
            }
            className={label}
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{entry.name}</span>
          </Link>
        ) : (
          <a href={download} download className={label} title="Download">
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{entry.name}</span>
          </a>
        )}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap text-muted-foreground tabular-nums max-sm:hidden">
        {directory ? "—" : formatBytes(entry.bytes)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground max-md:hidden">
        {formatDateTime(entry.modifiedAt)}
      </TableCell>
      <TableCell className="py-1.5 pr-4">
        <div className="flex justify-end gap-1">
          {directory ? null : (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Download ${entry.name}`}
              render={<a href={download} download />}
              nativeButton={false}
            >
              <DownloadIcon />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Actions for ${entry.name}`}
                />
              }
            >
              <EllipsisIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {editable && !directory ? (
                <DropdownMenuItem
                  render={
                    <Link
                      to="/servers/$name/files"
                      params={{ name }}
                      search={{ path: parentOf(entry.path), file: entry.path }}
                    />
                  }
                >
                  Edit
                </DropdownMenuItem>
              ) : null}
              {zip ? (
                <DropdownMenuItem onClick={() => onAction("extract")}>
                  Extract…
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => onAction("rename")}>
                Rename…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onAction("delete")}
              >
                Delete…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}
