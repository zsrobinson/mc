import { ArchiveIcon } from "lucide-react";
import type { ReactNode } from "react";

/** What is saved before a destructive change, in the TypedConfirm note slot. */
export function BackupFirstNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <ArchiveIcon
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <div className="flex flex-col gap-1">
        <span className="font-medium">Backed up first</span>
        <span className="text-muted-foreground">{children}</span>
      </div>
    </div>
  );
}
