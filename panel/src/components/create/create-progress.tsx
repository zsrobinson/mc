import { useQuery } from "@tanstack/react-query";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@zsrobinson/shell/ui/item";
import { Spinner } from "@zsrobinson/shell/ui/spinner";

import { control } from "@/lib/api";

type Progress = { phase?: string; detail?: string } | string | null;

/**
 * Shown while create-server runs. The phase comes from the control service's
 * create-progress verb when it offers one; nothing here is simulated.
 */
export function CreateProgress({ name }: { name: string }) {
  const progress = useQuery({
    queryKey: ["create-progress", name],
    queryFn: ({ signal }) =>
      control<Progress>("create-progress", name, {}, signal),
    // Stop asking if this control service has no create-progress verb.
    refetchInterval: (query) =>
      query.state.status === "error" ? false : 1_500,
    retry: false,
  });
  const data = progress.data;
  const phase = typeof data === "string" ? data : data?.phase;
  const detail = typeof data === "object" && data ? data.detail : undefined;

  return (
    <Item variant="muted" size="sm" role="status" aria-live="polite">
      <ItemMedia>
        <Spinner />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{phase ?? `Setting up ${name}`}</ItemTitle>
        <ItemDescription className="text-xs">
          {detail ??
            "The page opens the server once it has started and its first backup is saved."}
        </ItemDescription>
      </ItemContent>
    </Item>
  );
}
