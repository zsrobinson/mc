import { useNavigate } from "@tanstack/react-router";
import { Button } from "@zsrobinson/shell/ui/button";

import { useControlMutation } from "@/lib/mutations";
import { ConfirmAction } from "@zsrobinson/shell/blocks/confirm-action";

export function DeleteSection({ name }: { name: string }) {
  const navigate = useNavigate();
  const remove = useControlMutation<
    { confirm: true; confirmName: string },
    unknown
  >("delete-server", name, {
    success: `Deleted ${name}; its data is kept in a backup`,
    onSuccess: () => void navigate({ to: "/" }),
  });

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">Delete server</h3>
      <p className="text-sm text-muted-foreground">
        The server is stopped and removed, and its DNS record is deleted. Its
        world and settings move into a retained backup; nothing is erased.
      </p>
      <div>
        <ConfirmAction
          trigger={
            <Button variant="destructive" disabled={remove.isPending}>
              Delete server
            </Button>
          }
          title={`Delete ${name}?`}
          confirmLabel="Delete server"
          destructive
          typedName={name}
          onConfirm={() =>
            remove.mutateAsync({ confirm: true, confirmName: name })
          }
        >
          Players lose access and the join address stops working. The data is
          kept in a backup.
        </ConfirmAction>
      </div>
    </section>
  );
}
