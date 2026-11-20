import { useId, useState } from "react";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Card,
  CardContent,
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
import { toast } from "@zsrobinson/shell";

import { useControlMutation } from "@/lib/mutations";

const MAX_BYTES = 16 * 1024 * 1024;

async function toBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function DatapackUploadCard({ name }: { name: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const id = useId();
  const upload = useControlMutation<
    { filename: string; data: string },
    { uploaded: string; note: string }
  >("upload-datapack", name, {
    success: (result) => result.note || `Uploaded ${result.uploaded}`,
    onSuccess: () => {
      setFile(null);
      setInputKey((key) => key + 1);
    },
  });
  const tooLarge = file !== null && file.size > MAX_BYTES;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Upload datapack</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!file || tooLarge) return;
            try {
              upload.mutate({
                filename: file.name,
                data: await toBase64(file),
              });
            } catch {
              toast.error("The file could not be read.");
            }
          }}
        >
          <Field data-invalid={tooLarge || undefined}>
            <FieldLabel htmlFor={id}>ZIP file</FieldLabel>
            <Input
              key={inputKey}
              id={id}
              type="file"
              accept=".zip,application/zip"
              aria-invalid={tooLarge || undefined}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <FieldDescription>
              {tooLarge
                ? "This file is larger than 16 MiB."
                : "Up to 16 MiB with a pack.mcmeta. Reload or restart to enable it."}
            </FieldDescription>
          </Field>
          <Button
            type="submit"
            variant="outline"
            className="self-start"
            disabled={!file || tooLarge || upload.isPending}
          >
            {upload.isPending ? <Spinner data-icon="inline-start" /> : null}
            Upload
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
