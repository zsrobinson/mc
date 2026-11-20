import { SectionGroup } from "@zsrobinson/shell";
import { createFileRoute } from "@tanstack/react-router";

import { ConsoleCard } from "@/components/console/console-card";
import { LogFilesCard } from "@/components/console/log-files-card";

export const Route = createFileRoute("/servers/$name/console")({
  staticData: { crumb: "Console" },
  component: ConsolePage,
});

function ConsolePage() {
  const { name } = Route.useParams();
  return (
    <SectionGroup>
      <ConsoleCard name={name} />
      <LogFilesCard name={name} />
    </SectionGroup>
  );
}
