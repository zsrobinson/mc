import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
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
  FieldError,
  FieldLabel,
} from "@zsrobinson/shell/ui/field";
import { Input } from "@zsrobinson/shell/ui/input";
import { Spinner } from "@zsrobinson/shell/ui/spinner";

import { useControlMutation } from "@/lib/mutations";
import { serversQuery } from "@/lib/queries";
import { MAX_NAME_LENGTH, serverNameError } from "@/lib/server-name";
import type { Server } from "@/lib/types";
import { ConfirmAction } from "../confirm-action";

export function RenameCard({ server }: { server: Server }) {
  const navigate = useNavigate();
  const servers = useQuery(serversQuery);
  const [newName, setNewName] = useState("");
  const id = useId();
  const rename = useControlMutation<
    { newName: string; confirm: true; confirmName: string },
    Server
  >("rename-server", server.name, {
    success: (result) => `Renamed to ${result.name}`,
    onSuccess: (result) =>
      void navigate({
        to: "/servers/$name/settings",
        params: { name: result.name },
        replace: true,
      }),
  });
  const error =
    newName === ""
      ? null
      : serverNameError(newName, servers.data?.map((item) => item.name) ?? []);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Rename server</CardTitle>
      </CardHeader>
      <CardContent>
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor={id}>New name</FieldLabel>
          <Input
            id={id}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={MAX_NAME_LENGTH}
            aria-invalid={error ? true : undefined}
            value={newName}
            onChange={(event) => setNewName(event.target.value.toLowerCase())}
          />
          {error ? (
            <FieldError>{error}</FieldError>
          ) : (
            <FieldDescription>
              The join address follows the new name.
            </FieldDescription>
          )}
        </Field>
      </CardContent>
      <CardFooter>
        <ConfirmAction
          trigger={
            <Button
              variant="outline"
              disabled={!newName || !!error || rename.isPending}
            >
              {rename.isPending ? <Spinner data-icon="inline-start" /> : null}
              Rename
            </Button>
          }
          title={`Rename ${server.name} to ${newName}?`}
          confirmLabel="Rename server"
          typedName={server.name}
          onConfirm={() =>
            rename.mutateAsync({
              newName,
              confirm: true,
              confirmName: server.name,
            })
          }
        >
          The server restarts under the new name and its DNS record moves with
          it. Players using the old address must switch to the new one.
        </ConfirmAction>
      </CardFooter>
    </Card>
  );
}
