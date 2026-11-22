import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FormStack, PageHeader, PageTitle, toast } from "@zsrobinson/shell";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@zsrobinson/shell/ui/field";
import { Input } from "@zsrobinson/shell/ui/input";
import { Switch } from "@zsrobinson/shell/ui/switch";
import { TypedConfirm } from "@zsrobinson/shell/blocks/typed-confirm";
import { BackupFirstNote } from "@/components/backup-first-note";
import { control } from "@/lib/api";
import { withIntent } from "@/lib/intent";
import { refreshServer } from "@/lib/mutations";

export const Route = createFileRoute("/servers/$name/world/reset")({
  staticData: {
    crumb: "Reset",
    parentCrumb: { label: "World", to: "/servers/$name/world" },
  },
  component: ResetWorldPage,
});

function ResetWorldPage() {
  const { name } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sameSeed, setSameSeed] = useState(true);
  const [seed, setSeed] = useState("");
  const seedId = useId();
  const switchId = useId();
  const source = sameSeed
    ? "the same seed"
    : seed.trim()
      ? "the seed you entered"
      : "a random seed";

  return (
    <FormStack>
      <PageHeader>
        <PageTitle>Reset world</PageTitle>
      </PageHeader>
      <TypedConfirm
        title={`Reset the world on ${name}`}
        typedName={name}
        consequences={[
          "The server stops and disconnects everyone online.",
          `A new world is generated from ${source}.`,
          "Builds, inventories and progress in the current world leave the live server.",
          "Settings, mods, players and bans stay as they are.",
        ]}
        safeguards={
          <BackupFirstNote>
            The current world is saved as a pinned snapshot you can restore from
            Backups.
          </BackupFirstNote>
        }
        confirmLabel="Reset world"
        pendingLabel="Backing up and resetting"
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
          try {
            await withIntent(name, "reset-world", (intent) =>
              control("reset-world", name, {
                ...(sameSeed
                  ? { sameSeed: true }
                  : seed.trim()
                    ? { seed: seed.trim() }
                    : {}),
                confirm: true,
                confirmName: name,
                intent,
              }),
            );
          } finally {
            void refreshServer(queryClient, name);
          }
          toast.success("World reset; the old world is in Backups");
          await navigate({ to: "/servers/$name/world", params: { name } });
        }}
      >
        <div className="flex flex-col gap-4">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor={switchId}>Keep the current seed</FieldLabel>
              <FieldDescription>
                Terrain regenerates the same way; nothing built survives.
              </FieldDescription>
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
                className="max-w-sm"
                placeholder="Leave blank for a random seed"
                maxLength={64}
                autoComplete="off"
                value={seed}
                onChange={(event) => setSeed(event.target.value)}
              />
            </Field>
          )}
        </div>
      </TypedConfirm>
    </FormStack>
  );
}
