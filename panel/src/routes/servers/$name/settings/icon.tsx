import { createFileRoute } from "@tanstack/react-router";
import { IconCard } from "@/components/settings/icon-card";

export const Route = createFileRoute("/servers/$name/settings/icon")({
  staticData: { crumb: "Icon" },
  component: IconSettings,
});

function IconSettings() {
  const { name } = Route.useParams();
  return <IconCard name={name} />;
}
