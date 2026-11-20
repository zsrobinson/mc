import { useId, useState } from "react";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@zsrobinson/shell/ui/card";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@zsrobinson/shell/ui/field";
import { Input } from "@zsrobinson/shell/ui/input";
import { Spinner } from "@zsrobinson/shell/ui/spinner";

import { downloadUrl } from "@/lib/api";
import { useUpload } from "@/lib/use-upload";

const MAX_ICON_BYTES = 256 * 1024;

async function checkIcon(file: File): Promise<string | null> {
  if (file.type !== "image/png") return "Choose a PNG file.";
  if (file.size > MAX_ICON_BYTES) return "The icon must be 256 KiB or smaller.";
  try {
    const image = await createImageBitmap(file);
    const ok = image.width === 64 && image.height === 64;
    image.close();
    return ok ? null : "The icon must be exactly 64 × 64 pixels.";
  } catch {
    return "This image could not be read.";
  }
}

export function IconCard({ name }: { name: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [missing, setMissing] = useState(false);
  const id = useId();
  const upload = useUpload("upload-icon", name, () => "Server icon updated");
  const current = `${downloadUrl("download-file", name, { path: "server-icon.png" })}&v=${version}`;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Server icon</CardTitle>
      </CardHeader>
      <CardContent className="flex items-start gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-xs text-muted-foreground">
          {preview ? (
            <img
              src={preview}
              alt="New icon"
              className="size-16 [image-rendering:pixelated]"
            />
          ) : missing ? (
            "None"
          ) : (
            <img
              src={current}
              alt="Current icon"
              className="size-16 [image-rendering:pixelated]"
              onError={() => setMissing(true)}
            />
          )}
        </div>
        <Field data-invalid={error ? true : undefined} className="min-w-0">
          <FieldLabel htmlFor={id}>PNG file</FieldLabel>
          <Input
            id={id}
            type="file"
            accept="image/png"
            aria-invalid={error ? true : undefined}
            onChange={async (event) => {
              const chosen = event.target.files?.[0] ?? null;
              if (preview) URL.revokeObjectURL(preview);
              setPreview(null);
              setFile(null);
              setError(null);
              if (!chosen) return;
              const problem = await checkIcon(chosen);
              setError(problem);
              if (!problem) {
                setFile(chosen);
                setPreview(URL.createObjectURL(chosen));
              }
            }}
          />
          <FieldDescription>
            {error ?? "64 × 64 pixels, up to 256 KiB."}
          </FieldDescription>
        </Field>
      </CardContent>
      <CardFooter>
        <Button
          variant="outline"
          disabled={!file || upload.isPending}
          onClick={async () => {
            try {
              await upload.mutateAsync({
                file: file!,
                params: { confirm: "true" },
              });
              setFile(null);
              setMissing(false);
              setVersion((value) => value + 1);
              if (preview) URL.revokeObjectURL(preview);
              setPreview(null);
            } catch {
              // Toast already shown.
            }
          }}
        >
          {upload.isPending ? <Spinner data-icon="inline-start" /> : null}
          Upload icon
        </Button>
      </CardFooter>
    </Card>
  );
}
