import { cn } from "cn";
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
  return (
    <Badge variant={stateTone(state) === "error" ? "destructive" : "outline"}>
      <StateDot state={state} className="size-1.5" />
      {stateLabel(state)}
    </Badge>
  );
}
