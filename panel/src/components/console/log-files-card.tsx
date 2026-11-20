import { useQuery } from "@tanstack/react-query";
import { DownloadIcon } from "lucide-react";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { logFilesQuery } from "@/lib/queries";
import { QueryError } from "../query-error";

export function LogFilesCard({ name }: { name: string }) {
  const files = useQuery(logFilesQuery(name));

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Log files</CardTitle>
      </CardHeader>
      <CardContent>
        {files.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : files.isError ? (
          <QueryError
            title="Log files could not be listed"
            error={files.error}
            onRetry={() => files.refetch()}
          />
        ) : files.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No log files</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9">File</TableHead>
                <TableHead className="h-9 text-right">Size</TableHead>
                <TableHead className="h-9 max-sm:hidden">Modified</TableHead>
                <TableHead className="h-9 w-10">
                  <span className="sr-only">Download</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.data.map((file) => (
                <TableRow key={file.name}>
                  <TableCell className="font-mono text-xs">
                    {file.name}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatBytes(file.bytes)}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-sm:hidden">
                    {formatDateTime(file.modifiedAt)}
                  </TableCell>
                  <TableCell className="py-1.5">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Download ${file.name}`}
                      render={
                        <a
                          href={downloadUrl("download-log", name, {
                            path: file.name,
                          })}
                          download
                        />
                      }
                      nativeButton={false}
                    >
                      <DownloadIcon />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
