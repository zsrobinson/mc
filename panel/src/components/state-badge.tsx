import { Link, useParams } from "@tanstack/react-router";
import { cn } from "@zsrobinson/shell/lib/utils";
import { Badge } from "@zsrobinson/shell/ui/badge";

import { stateLabel, stateTone, type StateTone } from "@/lib/state";

const DOT: Record<StateTone, string> = {
  on: "bg-primary",
  busy: "bg-primary/60 animate-pulse",
  off: "bg-muted-foreground/50",
  error: "bg-destructive",
};

export function StateDot({
  state,
  className,
}: {
  state: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 shrink-0 rounded-full",
        DOT[stateTone(state)],
        className,
      )}
    />
  );
}

export function StateBadge({ state }: { state: string }) {
  const { name } = useParams({ strict: false });
  const badge = (
    <Badge variant={stateTone(state) === "error" ? "destructive" : "outline"}>
      <StateDot state={state} className="size-1.5" />
      {stateLabel(state)}
    </Badge>
  );
  // A crash badge leads to Overview, which explains the exit and next steps.
  return state === "crashed" && name ? (
    <Link
      to="/servers/$name"
      params={{ name }}
      className="rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {badge}
    </Link>
  ) : (
    badge
  );
}
