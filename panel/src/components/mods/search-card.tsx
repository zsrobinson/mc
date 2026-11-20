import { useQuery } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@zsrobinson/shell/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@zsrobinson/shell/ui/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@zsrobinson/shell/ui/item";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";
import { Spinner } from "@zsrobinson/shell/ui/spinner";

import { searchQuery } from "@/lib/queries";
import type { Server } from "@/lib/types";
import { ConfirmAction } from "../confirm-action";
import { QueryError } from "../query-error";
import { configKey, KIND_LABEL, type ProjectKind } from "./kinds";
import { useApplyProjects } from "./use-apply-projects";

export function SearchCard({
  server,
  kind,
}: {
  server: Server;
  kind: ProjectKind;
}) {
  const [text, setText] = useState("");
  const q = useDeferredValue(text.trim());
  const search = useQuery(searchQuery(kind, q));
  const add = useApplyProjects(server.name, "Added and restarted");
  const key = configKey(kind);
  const installed = new Set(server[key]);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Add from Modrinth</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label={`Search ${KIND_LABEL[kind].many.toLowerCase()}`}
            placeholder={`Search ${KIND_LABEL[kind].many.toLowerCase()}`}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          {search.isFetching ? (
            <InputGroupAddon align="inline-end">
              <Spinner />
            </InputGroupAddon>
          ) : null}
        </InputGroup>
        {q.length < 2 ? null : search.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : search.isError ? (
          <QueryError
            title="Search failed"
            error={search.error}
            onRetry={() => search.refetch()}
          />
        ) : search.data.hits.length === 0 ? (
          <p className="text-sm text-muted-foreground">No results for “{q}”</p>
        ) : (
          <ItemGroup className="gap-2">
            {search.data.hits.map((hit) => (
              <Item key={hit.slug} size="sm" variant="outline">
                <ItemContent>
                  <ItemTitle>{hit.title}</ItemTitle>
                  <ItemDescription className="text-xs">
                    {hit.description}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  {installed.has(hit.slug) ? (
                    <span className="text-xs text-muted-foreground">
                      Installed
                    </span>
                  ) : (
                    <ConfirmAction
                      trigger={
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={add.isPending}
                        >
                          Add
                        </Button>
                      }
                      title={`Add ${hit.title}?`}
                      confirmLabel="Add and restart"
                      onConfirm={() =>
                        add.mutateAsync({ [key]: [...server[key], hit.slug] })
                      }
                    >
                      A backup is taken first, then the server restarts with
                      this {KIND_LABEL[kind].one}.
                    </ConfirmAction>
                  )}
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </CardContent>
    </Card>
  );
}
