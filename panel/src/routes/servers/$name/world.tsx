import { createFileRoute } from "@tanstack/react-router";

import {
  DownloadWorldCard,
  ReplaceWorldCard,
  ResetWorldCard,
} from "@/components/world/world-cards";

export const Route = createFileRoute("/servers/$name/world")({
  staticData: { crumb: "World" },
  component: WorldPage,
});

function WorldPage() {
  const { name } = Route.useParams();
  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      <div className="grid gap-4">
        <DownloadWorldCard name={name} />
        <ResetWorldCard name={name} />
      </div>
      <ReplaceWorldCard name={name} />
    </div>
  );
}
