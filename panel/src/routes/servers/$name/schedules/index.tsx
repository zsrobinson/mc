import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageStack, PageTitle } from "@zsrobinson/shell";
import { Card, CardContent, CardHeader } from "@zsrobinson/shell/ui/card";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";
import { QueryError } from "@zsrobinson/shell/blocks/query-error";
import { TasksCard } from "@/components/schedules/tasks-card";
import { tasksQuery } from "@/lib/queries";

export const Route = createFileRoute("/servers/$name/schedules/")({
  staticData: { crumb: "Schedules" },
  loader: ({ context: { queryClient }, params }) => {
    void queryClient.prefetchQuery(tasksQuery(params.name));
  },
  component: SchedulesPage,
});

function SchedulesPage() {
  const { name } = Route.useParams();
  const tasks = useQuery(tasksQuery(name));
  return (
    <PageStack>
      <PageHeader>
        <PageTitle>Schedules</PageTitle>
      </PageHeader>
      {tasks.isPending ? (
        <Card aria-busy="true">
          <CardHeader>
            <Skeleton className="h-5 w-20" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-11 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : tasks.isError ? (
        <QueryError
          title="Schedules could not be loaded"
          error={tasks.error}
          onRetry={() => tasks.refetch()}
        />
      ) : (
        <TasksCard name={name} data={tasks.data} />
      )}
    </PageStack>
  );
}
