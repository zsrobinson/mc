import { createFileRoute } from "@tanstack/react-router";

import { DnsCard } from "@/components/dns/dns-card";
import { DeleteCard } from "@/components/settings/delete-card";
import { IconCard } from "@/components/settings/icon-card";
import { PropertiesCard } from "@/components/settings/properties-card";
import { RenameCard } from "@/components/settings/rename-card";
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
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <PropertiesCard name={name} />
      {server ? (
        <div className="grid gap-4">
          <ResourcesCard
            key={`${server.memory}:${server.port}`}
            server={server}
          />
          <ScheduleCard
            key={`${server.schedule?.restartAt}:${server.schedule?.backupAt}`}
            server={server}
          />
          <DnsCard server={server} />
          <IconCard name={name} />
          <RenameCard key={server.name} server={server} />
          <DeleteCard name={name} />
        </div>
      ) : null}
    </div>
  );
}
