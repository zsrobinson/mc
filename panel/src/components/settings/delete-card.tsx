import { useNavigate } from "@tanstack/react-router";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@zsrobinson/shell/ui/card";

import { useControlMutation } from "@/lib/mutations";
import { ConfirmAction } from "../confirm-action";

export function DeleteCard({ name }: { name: string }) {
  const navigate = useNavigate();
  const remove = useControlMutation<
    { confirm: true; confirmName: string },
    unknown
  >("delete-server", name, {
    success: `Deleted ${name}; its data is kept in a backup`,
    onSuccess: () => void navigate({ to: "/" }),
  });

  return (
    <Card size="sm" className="ring-destructive/20">
      <CardHeader>
        <CardTitle>Delete server</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        The server is stopped and removed, and its DNS record is deleted. Its
        world and settings move into a retained backup; nothing is erased.
      </CardContent>
      <CardFooter>
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
      </CardFooter>
    </Card>
  );
}
