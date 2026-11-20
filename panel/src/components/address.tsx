import { cn } from "cn";

import { CopyButton } from "@zsrobinson/shell/blocks/copy-button";

/** An address with a copy button. The join address is the one to share. */
export function Address({
  value,
  label,
  muted = false,
  className,
}: {
  value: string;
  label: string;
  muted?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-1",
        muted && "text-muted-foreground",
        className,
      )}
    >
      <span className="truncate font-mono text-code select-all">{value}</span>
      <CopyButton value={value} label={`Copy ${label}`} />
    </span>
  );
}
