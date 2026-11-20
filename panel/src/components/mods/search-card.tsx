import { useQuery } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Badge } from "@zsrobinson/shell/ui/badge";
import { Button } from "@zsrobinson/shell/ui/button";
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
  ItemMedia,
  ItemTitle,
} from "@zsrobinson/shell/ui/item";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";
import { Spinner } from "@zsrobinson/shell/ui/spinner";

import { formatCount } from "@/lib/format";
import { searchQuery } from "@/lib/queries";
import type { Server } from "@/lib/types";
import { ConfirmAction } from "@zsrobinson/shell/blocks/confirm-action";
import { QueryError } from "@zsrobinson/shell/blocks/query-error";
import { configKey, KIND_LABEL, type ProjectKind } from "./kinds";
import { ProjectIcon } from "./project-icon";
import { useApplyProjects } from "./use-apply-projects";

export function SearchCard({
  server,
  kind,
  text: controlled,
  onTextChange,
  part,
}: {
  server: Server;
  kind: ProjectKind;
  text?: string;
  onTextChange?: (text: string) => void;
  part?: "input" | "results";
}) {
  const [local, setLocal] = useState("");
  const text = controlled ?? local;
  const setText = onTextChange ?? setLocal;
  const q = useDeferredValue(text.trim());
  const search = useQuery(searchQuery(kind, q, server.version));
  const add = useApplyProjects(server.name, "Added and restarted");
  const key = configKey(kind);
  const installed = new Set(server[key]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {part !== "results" ? (
        <>
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label={`Search ${KIND_LABEL[kind].many.toLowerCase()}`}
              placeholder="Search Modrinth"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            {search.isFetching ? (
              <InputGroupAddon align="inline-end">
                <Spinner />
              </InputGroupAddon>
            ) : null}
          </InputGroup>
        </>
      ) : null}
      {part === "input" || q.length < 2 ? null : search.isPending ? (
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
              <ItemMedia>
                <ProjectIcon title={hit.title} iconUrl={hit.iconUrl} />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle>{hit.title}</ItemTitle>
                <ItemDescription className="text-xs">
                  {hit.description}
                </ItemDescription>
                <ItemDescription className="flex flex-wrap items-center gap-2 text-xs">
                  {hit.downloads !== undefined ? (
                    <span>{formatCount(hit.downloads)} downloads</span>
                  ) : null}
                  {hit.compatible ? (
                    <Badge variant="outline">Works with {server.version}</Badge>
                  ) : null}
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
                    A backup is taken first, then the server restarts with this{" "}
                    {KIND_LABEL[kind].one}.
                  </ConfirmAction>
                )}
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
    </div>
  );
}
