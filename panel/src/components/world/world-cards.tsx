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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@zsrobinson/shell/ui/field";
import { Input } from "@zsrobinson/shell/ui/input";
import { Spinner } from "@zsrobinson/shell/ui/spinner";
import { Switch } from "@zsrobinson/shell/ui/switch";

import { downloadUrl } from "@/lib/api";
import { useControlMutation } from "@/lib/mutations";
import { MAX_UPLOAD_BYTES, useUpload } from "@/lib/use-upload";
import { ConfirmAction } from "../confirm-action";
import { UploadProgress } from "../upload-progress";

export function DownloadWorldCard({ name }: { name: string }) {
  return (
    <Card size="sm">
      <CardHeader className="items-center">
        <CardTitle className="flex min-h-8 items-center">
          Download world
        </CardTitle>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            render={<a href={downloadUrl("download-world", name)} download />}
            nativeButton={false}
          >
            <DownloadIcon data-icon="inline-start" />
            ZIP
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  );
}

export function ReplaceWorldCard({ name }: { name: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const id = useId();
  const upload = useUpload("upload-world", name, () => "World replaced");
  const tooLarge = file !== null && file.size > MAX_UPLOAD_BYTES;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Replace world</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Field data-invalid={tooLarge || undefined}>
          <FieldLabel htmlFor={id}>World ZIP</FieldLabel>
          <Input
            key={inputKey}
            id={id}
            type="file"
            accept=".zip,application/zip"
            aria-invalid={tooLarge || undefined}
            disabled={upload.isPending}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <FieldDescription>
            {tooLarge
              ? "This file is larger than 512 MiB."
              : "Up to 512 MiB, containing level.dat. The current world is backed up and kept."}
          </FieldDescription>
        </Field>
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
            setInputKey((key) => key + 1);
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
              placeholder="Random"
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
