import { createFileRoute } from "@tanstack/react-router";
import { Page, PageHeader, PageTitle } from "@zsrobinson/shell";

import { CreateServerForm } from "@/components/create/create-server-form";
import { limitsQuery, versionsQuery } from "@/lib/queries";

export const Route = createFileRoute("/new")({
  staticData: { crumb: "New server" },
  loader: ({ context: { queryClient } }) => {
    void queryClient.prefetchQuery(versionsQuery);
    void queryClient.prefetchQuery(limitsQuery);
  },
  component: NewServerPage,
});

function NewServerPage() {
  return (
    <Page>
      <PageHeader>
        <PageTitle>New server</PageTitle>
      </PageHeader>
      <CreateServerForm />
    </Page>
  );
}
