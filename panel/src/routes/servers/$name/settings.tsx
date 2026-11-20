import { FormStack } from "@zsrobinson/shell";
import { createFileRoute } from "@tanstack/react-router";

import { DangerZone } from "@/components/settings/danger-zone";
import { IconCard } from "@/components/settings/icon-card";
import { PropertiesCard } from "@/components/settings/properties-card";
import { ResourcesCard } from "@/components/settings/resources-card";
import { ScheduleCard } from "@/components/settings/schedule-card";
import { limitsQuery, propertiesQuery } from "@/lib/queries";
import { useServer } from "@/lib/use-server";

export const Route = createFileRoute("/servers/$name/settings")({
  staticData: { crumb: "Settings" },
  loader: ({ context: { queryClient }, params }) => {
    void queryClient.prefetchQuery(propertiesQuery(params.name));
    void queryClient.prefetchQuery(limitsQuery);
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { name } = Route.useParams();
  const { data: server } = useServer(name);

  return (
    <FormStack>
      <PropertiesCard name={name} />
      {server ? (
        <>
          <ResourcesCard
            key={`${server.memory}:${server.port}`}
            server={server}
          />
          <ScheduleCard
            key={`${server.schedule?.restartAt}:${server.schedule?.backupAt}`}
            server={server}
            kind="restart"
          />
          <IconCard name={name} />
          <DangerZone server={server} />
        </>
      ) : null}
    </FormStack>
  );
}
