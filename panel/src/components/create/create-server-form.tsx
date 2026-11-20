import {
  NativeSelect,
  NativeSelectOption,
} from "@zsrobinson/shell/ui/native-select";
import { CardHeader, CardTitle } from "@zsrobinson/shell/ui/card";
import { PageStack } from "@zsrobinson/shell";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@zsrobinson/shell/lib/utils";
import { Button } from "@zsrobinson/shell/ui/button";
import { Card, CardContent, CardFooter } from "@zsrobinson/shell/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@zsrobinson/shell/ui/field";
import { Input } from "@zsrobinson/shell/ui/input";
import { Spinner } from "@zsrobinson/shell/ui/spinner";

import { availableHeapMiB } from "@/lib/budget";
import { formatMiB } from "@/lib/format";
import { useControlMutation } from "@/lib/mutations";
import { limitsQuery, serversQuery, versionsQuery } from "@/lib/queries";
import { MAX_NAME_LENGTH, serverNameError } from "@/lib/server-name";
import type { Server } from "@/lib/types";
import {
  AdvancedFields,
  advancedErrors,
  advancedPayload,
  EMPTY_ADVANCED,
  type Advanced,
} from "./advanced-fields";
import { BudgetFull } from "./budget-full";
import { CreateProgress } from "./create-progress";

type Payload = { name: string } & ReturnType<typeof advancedPayload>;

/**
 * A name is enough; the control service picks the newest release, memory
 * within the budget, a free port, the DNS record and backups. Advanced
 * options override those defaults.
 */
export function CreateServerForm() {
  const navigate = useNavigate();
  const limits = useQuery(limitsQuery);
  const versions = useQuery(versionsQuery);
  const servers = useQuery(serversQuery);
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advanced, setAdvanced] = useState<Advanced>(EMPTY_ADVANCED);

  const create = useControlMutation<Payload, Server>(
    "create-server",
    undefined,
    {
      success: (server) => `${server.name} is ready`,
      onSuccess: (server) =>
        void navigate({ to: "/servers/$name", params: { name: server.name } }),
    },
  );

  const maxHeap =
    limits.data && servers.data
      ? availableHeapMiB(limits.data, servers.data)
      : undefined;
  const full =
    (limits.data && servers.data
      ? servers.data.length >= limits.data.maxServers
      : false) || maxHeap === 0;
  const nameError = serverNameError(
    name,
    servers.data?.map((server) => server.name),
  );
  const extraErrors = advancedErrors(advanced, {
    limits: limits.data,
    servers: servers.data,
    maxHeap,
  });
  const valid =
    !nameError && Object.values(extraErrors).every((error) => !error);
  const showNameError = (touched || name !== "") && nameError;

  return (
    <PageStack className="max-w-3xl">
      {full && servers.data ? (
        <BudgetFull servers={servers.data} limits={limits.data} />
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Server</CardTitle>
        </CardHeader>
        <form
          className="contents"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (!valid || create.isPending) return;
            create.mutate({ name, ...advancedPayload(advanced) });
          }}
        >
          <CardContent>
            <FieldGroup className="gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={showNameError ? true : undefined}>
                  <FieldLabel htmlFor="server-name">Name</FieldLabel>
                  <Input
                    id="server-name"
                    autoFocus
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    maxLength={MAX_NAME_LENGTH}
                    disabled={create.isPending}
                    aria-invalid={showNameError ? true : undefined}
                    value={name}
                    onChange={(event) =>
                      setName(event.target.value.toLowerCase())
                    }
                  />
                  {showNameError ? (
                    <FieldError>{nameError}</FieldError>
                  ) : (
                    <FieldDescription>
                      Becomes the join address. Lowercase letters, digits and
                      hyphens.
                    </FieldDescription>
                  )}
                </Field>
                <Field>
                  <FieldLabel htmlFor="server-version">Version</FieldLabel>
                  <NativeSelect
                    id="server-version"
                    className="w-full"
                    disabled={create.isPending}
                    value={advanced.version}
                    onChange={(e) =>
                      setAdvanced((v) => ({ ...v, version: e.target.value }))
                    }
                  >
                    <NativeSelectOption value="">
                      Latest{versions.data?.[0] ? ` (${versions.data[0]})` : ""}
                    </NativeSelectOption>
                    {versions.data?.map((v) => (
                      <NativeSelectOption key={v} value={v}>
                        {v}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              </div>
              <div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-ml-3"
                  aria-expanded={showAdvanced}
                  aria-controls="advanced-options"
                  onClick={() => setShowAdvanced((open) => !open)}
                >
                  Advanced options
                  <ChevronDownIcon
                    data-icon="inline-end"
                    className={cn(
                      "transition-transform",
                      showAdvanced && "rotate-180",
                    )}
                  />
                </Button>
              </div>
              {showAdvanced ? (
                <AdvancedFields
                  id="advanced-options"
                  value={advanced}
                  onChange={setAdvanced}
                  errors={extraErrors}
                  limits={limits.data}
                  disabled={create.isPending}
                  memoryHint={
                    maxHeap !== undefined
                      ? `${formatMiB(maxHeap)} available`
                      : undefined
                  }
                />
              ) : null}
            </FieldGroup>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-4">
            {create.isPending ? <CreateProgress name={name} /> : null}
            <Button
              type="submit"
              className="self-start"
              disabled={create.isPending || full || (touched && !valid)}
            >
              {create.isPending ? <Spinner data-icon="inline-start" /> : null}
              {create.isPending ? "Creating" : "Create server"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </PageStack>
  );
}
