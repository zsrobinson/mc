import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, DownloadIcon } from "lucide-react";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@zsrobinson/shell/ui/card";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";

import { downloadUrl } from "@/lib/api";
import { formatBytes, formatDateTime, formatRelative } from "@/lib/format";
import { worldInfoQuery } from "@/lib/queries";
import {
  DetailList,
  DetailRow,
  Unavailable,
} from "@zsrobinson/shell/blocks/detail-list";

export function DownloadWorldCard({ name }: { name: string }) {
  const info = useQuery(worldInfoQuery(name));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex min-h-8 items-center">World</CardTitle>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            render={<a href={downloadUrl("download-world", name)} download />}
            nativeButton={false}
          >
            <DownloadIcon data-icon="inline-start" />
            Download ZIP
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <DetailList>
          <DetailRow label="Size">
            {info.data ? (
              formatBytes(info.data.bytes)
            ) : info.isPending ? (
              <Skeleton className="h-4 w-16" />
            ) : (
              <Unavailable>Not reported</Unavailable>
            )}
          </DetailRow>
          <DetailRow label="Last saved">
            {info.data ? (
              <span title={formatDateTime(info.data.modifiedAt)}>
                {formatRelative(info.data.modifiedAt)}
              </span>
            ) : info.isPending ? (
              <Skeleton className="h-4 w-24" />
            ) : (
              <Unavailable>Not reported</Unavailable>
            )}
          </DetailRow>
          {info.data?.version ? (
            <DetailRow label="Saved by">
              Minecraft {info.data.version}
            </DetailRow>
          ) : null}
        </DetailList>
      </CardContent>
    </Card>
  );
}

/** Destructive world changes each have a page that explains them first. */
export function WorldChangesCard({ name }: { name: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Change the world</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {(
          [
            [
              "Reset world",
              "Generate a new world from the same seed, a new seed or a random one.",
              "/servers/$name/world/reset",
            ],
            [
              "Replace world",
              "Upload a world ZIP (up to 512 MiB) to take the current world’s place.",
              "/servers/$name/world/replace",
            ],
          ] as const
        ).map(([title, text, to]) => (
          <div
            key={to}
            className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium">{title}</span>
              <span className="text-sm text-muted-foreground">{text}</span>
            </div>
            <Button
              variant="outline"
              render={<Link to={to} params={{ name }} />}
              nativeButton={false}
            >
              {title}
              <ChevronRightIcon data-icon="inline-end" />
            </Button>
          </div>
        ))}
        <p className="pt-3 text-sm text-muted-foreground">
          Either way the current world is backed up and pinned first.
        </p>
      </CardContent>
    </Card>
  );
}
