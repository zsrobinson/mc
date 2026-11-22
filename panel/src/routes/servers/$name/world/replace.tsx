import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FormStack, PageHeader, PageTitle, toast } from "@zsrobinson/shell";
import { Button } from "@zsrobinson/shell/ui/button";
import { FileDrop } from "@zsrobinson/shell/blocks/file-drop";
import { TypedConfirm } from "@zsrobinson/shell/blocks/typed-confirm";
import { UploadProgress } from "@zsrobinson/shell/blocks/upload-progress";
import { BackupFirstNote } from "@/components/backup-first-note";
import { upload } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { withIntent } from "@/lib/intent";
import { refreshServer } from "@/lib/mutations";
import { MAX_UPLOAD_BYTES } from "@/lib/use-upload";

export const Route = createFileRoute("/servers/$name/world/replace")({
  staticData: {
    crumb: "Replace",
    parentCrumb: { label: "World", to: "/servers/$name/world" },
  },
  component: ReplaceWorldPage,
});

function ReplaceWorldPage() {
  const { name } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  // Null while idle; the fraction sent while uploading.
  const [progress, setProgress] = useState<number | null>(null);
  const tooLarge = file !== null && file.size > MAX_UPLOAD_BYTES;

  return (
    <FormStack>
      <PageHeader>
        <PageTitle>Replace world</PageTitle>
      </PageHeader>
      <TypedConfirm
        title={`Replace the world on ${name}`}
        typedName={name}
        consequences={[
          "The server stops and disconnects everyone online.",
          file
            ? `${file.name} (${formatBytes(file.size)}) becomes the world.`
            : "The ZIP you choose becomes the world. It must contain level.dat.",
          "The server starts again on the uploaded world.",
        ]}
        safeguards={
          <BackupFirstNote>
            The current world is saved as a pinned snapshot and set aside, so
            nothing is lost if the upload is wrong.
          </BackupFirstNote>
        }
        confirmLabel="Upload and replace"
        pendingLabel="Uploading"
        disabled={!file || tooLarge}
        cancel={
          <Button
            variant="outline"
            render={<Link to="/servers/$name/world" params={{ name }} />}
            nativeButton={false}
          >
            Cancel
          </Button>
        }
        onConfirm={async () => {
          if (!file) return;
          setProgress(0);
          try {
            await withIntent(name, "replace-world", (intent) =>
              upload(
                "upload-world",
                name,
                file,
                { confirm: "true", confirmName: name, intent },
                setProgress,
              ),
            );
          } finally {
            setProgress(null);
            void refreshServer(queryClient, name);
          }
          toast.success("World replaced; the old world is in Backups");
          await navigate({ to: "/servers/$name/world", params: { name } });
        }}
      >
        <div className="flex flex-col gap-2">
          <FileDrop
            accept=".zip,application/zip"
            file={file}
            onFile={setFile}
            disabled={progress !== null}
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
              : "Up to 512 MiB, with level.dat at its top level or in one folder."}
          </p>
          {progress !== null ? (
            <UploadProgress fraction={progress} label="Uploading world" />
          ) : null}
        </div>
      </TypedConfirm>
    </FormStack>
  );
}
