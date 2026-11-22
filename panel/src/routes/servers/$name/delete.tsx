import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FormStack, PageHeader, PageTitle, toast } from "@zsrobinson/shell";
import { Button } from "@zsrobinson/shell/ui/button";
import { TypedConfirm } from "@zsrobinson/shell/blocks/typed-confirm";
import { BackupFirstNote } from "@/components/backup-first-note";
import { control } from "@/lib/api";
import { withIntent } from "@/lib/intent";
import { keys } from "@/lib/queries";
import { useServer } from "@/lib/use-server";

export const Route = createFileRoute("/servers/$name/delete")({
  staticData: {
    crumb: "Delete",
    parentCrumb: { label: "Settings", to: "/servers/$name/settings" },
  },
  component: DeleteServerPage,
});

function DeleteServerPage() {
  const { name } = Route.useParams();
  const { data: server } = useServer(name);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return (
    <FormStack>
      <PageHeader>
        <PageTitle>Delete server</PageTitle>
      </PageHeader>
      <TypedConfirm
        title={`Delete ${name}`}
        typedName={name}
        consequences={[
          "The server stops and disconnects everyone online.",
          `It is removed from this panel${server?.joinAddress ? `, and ${server.joinAddress} stops working` : ""}.`,
          "Its schedules stop running; its activity history is kept.",
        ]}
        safeguards={
          <BackupFirstNote>
            The world, settings and mods are archived to a retained snapshot
            before anything is removed. Nothing is erased.
          </BackupFirstNote>
        }
        confirmLabel="Delete server"
        pendingLabel="Backing up and deleting"
        cancel={
          <Button
            variant="outline"
            render={
              <Link to="/servers/$name/settings/server" params={{ name }} />
            }
            nativeButton={false}
          >
            Cancel
          </Button>
        }
        onConfirm={async () => {
          await withIntent(name, "delete-server", (intent) =>
            control("delete-server", name, {
              confirm: true,
              confirmName: name,
              intent,
            }),
          );
          toast.success(`Deleted ${name}; its data is kept in a backup`);
          await navigate({ to: "/" });
          queryClient.removeQueries({ queryKey: keys.server(name) });
          await queryClient.invalidateQueries({ queryKey: keys.servers });
        }}
      />
    </FormStack>
  );
}
