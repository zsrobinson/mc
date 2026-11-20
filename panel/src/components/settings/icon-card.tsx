import { useState } from "react";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@zsrobinson/shell/ui/card";
import { Spinner } from "@zsrobinson/shell/ui/spinner";

import { downloadUrl } from "@/lib/api";
import { useUpload } from "@/lib/use-upload";
import { FileDrop } from "@zsrobinson/shell/blocks/file-drop";

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

  async function choose(chosen: File | null) {
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
  }
  const upload = useUpload("upload-icon", name, () => "Server icon updated");
  const current = `${downloadUrl("download-file", name, { path: "server-icon.png" })}&v=${version}`;

  return (
    <Card>
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
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <FileDrop
            accept="image/png"
            file={file}
            onFile={choose}
            disabled={upload.isPending}
            invalid={Boolean(error)}
            label="Choose a PNG"
          />
          <p
            className={
              error
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
          >
            {error ?? "64 × 64 pixels, up to 256 KiB."}
          </p>
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button
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
          Save
        </Button>
        <Button
          variant="ghost"
          disabled={!file || upload.isPending}
          onClick={() => void choose(null)}
        >
          Reset
        </Button>
      </CardFooter>
    </Card>
  );
}
