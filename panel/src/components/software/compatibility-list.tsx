import { CheckIcon, XIcon } from "lucide-react";
import { Badge } from "@zsrobinson/shell/ui/badge";

import type { Compatibility } from "@/lib/types";

export function CompatibilityList({ result }: { result: Compatibility }) {
  const blocked = result.projects.filter(
    (project) => !project.compatible,
  ).length;
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-muted/50 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {blocked === 0
            ? `Ready for ${result.version}`
            : `${blocked} blocking ${blocked === 1 ? "project" : "projects"}`}
        </span>
        <Badge variant="outline" className="font-mono">
          {result.javaTag}
        </Badge>
      </div>
      {result.projects.length === 0 ? (
        <p className="text-muted-foreground">No mods or datapacks to check</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {result.projects.map((project) => (
            <li key={project.project} className="flex items-center gap-2">
              {project.compatible ? (
                <CheckIcon
                  className="size-4 text-primary"
                  aria-label="Compatible"
                />
              ) : (
                <XIcon
                  className="size-4 text-destructive"
                  aria-label="Not compatible"
                />
              )}
              <span className="font-medium">{project.project}</span>
              <span className="text-xs text-muted-foreground">
                {project.kind}
              </span>
              <span className="ml-auto font-mono text-xs">
                {project.version ?? "No build"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
