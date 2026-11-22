import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeftIcon, DownloadIcon, InfoIcon } from "lucide-react";
import { Page, PageActions, PageHeader, PageTitle } from "@zsrobinson/shell";
import { Button } from "@zsrobinson/shell/ui/button";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";
import { QueryError } from "@zsrobinson/shell/blocks/query-error";
import { downloadUrl } from "@/lib/api";
import { logTextQuery } from "@/lib/queries";

export const Route = createFileRoute("/servers/$name/logs/$file")({
  staticData: {
    crumbParam: "file",
    parentCrumb: { label: "Console", to: "/servers/$name/console" },
    viewport: true,
  },
  loader: ({ context: { queryClient }, params }) => {
    void queryClient.prefetchQuery(logTextQuery(params.name, params.file));
  },
  component: LogPage,
});

/** One log file, read-only, newest lines last. */
function LogPage() {
  const { name, file } = Route.useParams();
  const log = useQuery(logTextQuery(name, file));
  return (
    <Page viewport>
      <PageHeader className="shrink-0">
        <PageTitle className="min-w-0 truncate font-mono text-base">
          {file}
        </PageTitle>
        <PageActions>
          <Button
            variant="ghost"
            size="sm"
            render={
              <Link
                to="/servers/$name/console"
                params={{ name }}
                search={{ view: "files" }}
              />
            }
            nativeButton={false}
          >
            <ChevronLeftIcon data-icon="inline-start" />
            Log files
          </Button>
          <Button
            variant="outline"
            size="sm"
            render={
              <a
                href={downloadUrl("download-log", name, { path: file })}
                download
              />
            }
            nativeButton={false}
          >
            <DownloadIcon data-icon="inline-start" />
            Download
          </Button>
        </PageActions>
      </PageHeader>
      {log.data?.truncated ? (
        <p className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          <InfoIcon className="size-4 shrink-0" aria-hidden="true" />
          Showing the last 1 MiB. Download the file for everything.
        </p>
      ) : null}
      {log.isPending ? (
        <div
          className="flex min-h-0 flex-1 flex-col gap-2 rounded-2xl bg-muted/50 p-4"
          aria-busy="true"
        >
          {[88, 72, 80, 64, 76, 58].map((width) => (
            <Skeleton
              key={width}
              className="h-3"
              style={{ width: `${width}%` }}
            />
          ))}
        </div>
      ) : log.isError ? (
        <QueryError
          title="This log could not be opened"
          error={log.error}
          onRetry={() => log.refetch()}
        />
      ) : (
        <pre
          tabIndex={0}
          aria-label={`Contents of ${file}`}
          className="min-h-0 flex-1 overflow-auto rounded-2xl bg-muted/50 p-4 font-mono text-xs leading-5 whitespace-pre-wrap break-words outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {log.data.text || (
            <span className="text-muted-foreground">This log is empty.</span>
          )}
        </pre>
      )}
    </Page>
  );
}
