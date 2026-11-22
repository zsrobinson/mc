import { createFileRoute } from "@tanstack/react-router";
import { PropertiesCard } from "@/components/settings/properties-card";

export const Route = createFileRoute("/servers/$name/settings/")({
  component: GameSettings,
});

function GameSettings() {
  const { name } = Route.useParams();
  return <PropertiesCard name={name} />;
}
