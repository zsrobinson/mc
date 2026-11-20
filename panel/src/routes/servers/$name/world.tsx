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
      <DownloadWorldCard name={name} />
      <ReplaceWorldCard name={name} />
      <ResetWorldCard name={name} />
    </div>
  );
}
