import type { UseQueryResult } from "@tanstack/react-query";
import { cn } from "@zsrobinson/shell/lib/utils";

/**
 * Live while the stream is open or polling succeeds; Reconnecting while both
 * fail and retry.
 */
export function ConnectionStatus({
  query,
  streaming,
}: {
  query: UseQueryResult;
  streaming: boolean;
}) {
  const state = streaming
    ? { label: "Live", dot: "bg-primary" }
    : query.isPaused
      ? { label: "Offline", dot: "bg-muted-foreground/50" }
      : query.isError
        ? { label: "Reconnecting", dot: "bg-destructive animate-pulse" }
        : query.isPending
          ? { label: "Connecting", dot: "bg-muted-foreground/50 animate-pulse" }
          : { label: "Live", dot: "bg-primary" };

  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full", state.dot)}
      />
      {state.label}
    </span>
  );
}
