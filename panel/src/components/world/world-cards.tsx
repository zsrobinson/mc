import { useQuery } from "@tanstack/react-query";
import { DownloadIcon } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@zsrobinson/shell/ui/card";
import { Field, FieldContent, FieldLabel } from "@zsrobinson/shell/ui/field";
import { Input } from "@zsrobinson/shell/ui/input";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";
import { Spinner } from "@zsrobinson/shell/ui/spinner";
import { Switch } from "@zsrobinson/shell/ui/switch";

import { downloadUrl } from "@/lib/api";
import { formatBytes, formatDateTime, formatRelative } from "@/lib/format";
import { worldInfoQuery } from "@/lib/queries";
import { useControlMutation } from "@/lib/mutations";
import { MAX_UPLOAD_BYTES, useUpload } from "@/lib/use-upload";
import { ConfirmAction } from "../confirm-action";
import { DetailList, DetailRow, Unavailable } from "../detail-list";
import { FileDrop } from "../file-drop";
import { UploadProgress } from "../upload-progress";

export function DownloadWorldCard({ name }: { name: string }) {
  const info = useQuery(worldInfoQuery(name));
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex min-h-8 items-center">World</CardTitle>
        <CardAction>
          <Button
            variant="outline"
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

export function ReplaceWorldCard({ name }: { name: string }) {
  const [file, setFile] = useState<File | null>(null);
  const upload = useUpload("upload-world", name, () => "World replaced");
  const tooLarge = file !== null && file.size > MAX_UPLOAD_BYTES;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Replace world</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <FileDrop
          accept=".zip,application/zip"
          file={file}
          onFile={setFile}
          disabled={upload.isPending}
          invalid={tooLarge}
          label="Choose a world ZIP"
        />
        <p
          className={
            tooLarge
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
        >
          {tooLarge
            ? "This file is larger than 512 MiB."
            : "Up to 512 MiB, containing level.dat. The current world is backed up and kept."}
        </p>
        {upload.isPending ? (
          <UploadProgress fraction={upload.progress} label="Uploading world" />
        ) : null}
      </CardContent>
      <CardFooter>
        <ConfirmAction
          trigger={
            <Button
              variant="destructive"
              disabled={!file || tooLarge || upload.isPending}
            >
              {upload.isPending ? <Spinner data-icon="inline-start" /> : null}
              Replace world
            </Button>
          }
          title={`Replace the world on ${name}?`}
          confirmLabel="Replace world"
          destructive
          typedName={name}
          onConfirm={async () => {
            await upload.mutateAsync({
              file: file!,
              params: { confirm: "true", confirmName: name },
            });
            setFile(null);
          }}
        >
          The server stops, the current world is backed up and set aside, and
          the uploaded world takes its place.
        </ConfirmAction>
      </CardFooter>
    </Card>
  );
}

export function ResetWorldCard({ name }: { name: string }) {
  const [sameSeed, setSameSeed] = useState(true);
  const [seed, setSeed] = useState("");
  const seedId = useId();
  const switchId = useId();
  const reset = useControlMutation<
    { seed?: string; sameSeed?: boolean; confirm: true; confirmName: string },
    unknown
  >("reset-world", name, { success: "World reset" });

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Reset world</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={switchId}>Keep the current seed</FieldLabel>
          </FieldContent>
          <Switch
            id={switchId}
            checked={sameSeed}
            onCheckedChange={setSameSeed}
          />
        </Field>
        {sameSeed ? null : (
          <Field>
            <FieldLabel htmlFor={seedId}>Seed</FieldLabel>
            <Input
              id={seedId}
              placeholder="Leave blank for a random seed"
              maxLength={64}
              autoComplete="off"
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
            />
          </Field>
        )}
      </CardContent>
      <CardFooter>
        <ConfirmAction
          trigger={
            <Button variant="destructive" disabled={reset.isPending}>
              {reset.isPending ? <Spinner data-icon="inline-start" /> : null}
              Reset world
            </Button>
          }
          title={`Reset the world on ${name}?`}
          confirmLabel="Reset world"
          destructive
          typedName={name}
          onConfirm={() =>
            reset.mutateAsync({
              ...(sameSeed
                ? { sameSeed: true }
                : seed.trim()
                  ? { seed: seed.trim() }
                  : {}),
              confirm: true,
              confirmName: name,
            })
          }
        >
          The current world is backed up, then a new world is generated
          {sameSeed
            ? " from the same seed"
            : seed.trim()
              ? " from this seed"
              : " from a random seed"}
          . Player progress in it is lost.
        </ConfirmAction>
      </CardFooter>
    </Card>
  );
}
