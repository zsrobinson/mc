import { PageGrid } from "@zsrobinson/shell";
import { createFileRoute } from "@tanstack/react-router";

import { LoaderCard } from "@/components/software/loader-card";
import { MinecraftCard } from "@/components/software/minecraft-card";
import { versionsQuery } from "@/lib/queries";
import { useServer } from "@/lib/use-server";

export const Route = createFileRoute("/servers/$name/software")({
  staticData: { crumb: "Software" },
  loader: ({ context: { queryClient } }) => {
    void queryClient.prefetchQuery(versionsQuery);
  },
  component: SoftwarePage,
});

function SoftwarePage() {
  const { name } = Route.useParams();
  const { data: server } = useServer(name);
  if (!server) return null;
  return (
    <PageGrid>
      <MinecraftCard server={server} />
      <LoaderCard server={server} />
    </PageGrid>
  );
}
