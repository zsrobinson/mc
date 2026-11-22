import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PlayIcon } from "lucide-react";
import { FormStack, PageHeader, PageTitle } from "@zsrobinson/shell";
import { Button } from "@zsrobinson/shell/ui/button";
import { Card, CardContent, CardHeader } from "@zsrobinson/shell/ui/card";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";
import { Spinner } from "@zsrobinson/shell/ui/spinner";
import { ConfirmAction } from "@zsrobinson/shell/blocks/confirm-action";
import { EmptyState } from "@zsrobinson/shell/blocks/empty-state";
import { QueryError } from "@zsrobinson/shell/blocks/query-error";
import { TaskForm } from "@/components/schedules/task-form";
import { useControlMutation } from "@/lib/mutations";
import { tasksQuery } from "@/lib/queries";
import { KIND_LABELS } from "@/lib/schedule";

export const Route = createFileRoute("/servers/$name/schedules/$id")({
  staticData: {
    crumb: "Edit task",
    parentCrumb: { label: "Schedules", to: "/servers/$name/schedules" },
  },
  loader: ({ context: { queryClient }, params }) => {
    void queryClient.prefetchQuery(tasksQuery(params.name));
  },
  component: EditTaskPage,
});

function EditTaskPage() {
  const { name, id } = Route.useParams();
  const navigate = useNavigate();
  const tasks = useQuery(tasksQuery(name));
  const task = tasks.data?.tasks.find((item) => item.id === id);
  const run = useControlMutation<{ id: string }, unknown>("run-task", name, {
    success: "Task ran",
  });
  const remove = useControlMutation<{ id: string; confirm: true }, unknown>(
    "delete-task",
    name,
    {
      success: "Task deleted",
      onSuccess: () =>
        void navigate({ to: "/servers/$name/schedules", params: { name } }),
    },
  );

  return (
    <FormStack>
      <PageHeader>
        <PageTitle>
          {task ? `Edit ${KIND_LABELS[task.kind].toLowerCase()}` : "Edit task"}
        </PageTitle>
      </PageHeader>
      {tasks.isPending ? (
        <Card aria-busy="true">
          <CardHeader>
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-9 w-40" />
          </CardContent>
        </Card>
      ) : tasks.isError ? (
        <QueryError
          title="This task could not be loaded"
          error={tasks.error}
          onRetry={() => tasks.refetch()}
        />
      ) : !task ? (
        <Card>
          <CardContent>
            <EmptyState
              title="Task not found"
              description="It may have been deleted."
              action={
                <Button
                  variant="outline"
                  render={
                    <Link to="/servers/$name/schedules" params={{ name }} />
                  }
                  nativeButton={false}
                >
                  Back to schedules
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <TaskForm
          key={task.id}
          name={name}
          task={task}
          extraActions={
            <>
              <Button
                type="button"
                variant="ghost"
                disabled={run.isPending}
                onClick={() => run.mutate({ id: task.id })}
              >
                {run.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <PlayIcon data-icon="inline-start" />
                )}
                Run now
              </Button>
              <ConfirmAction
                trigger={
                  <Button type="button" variant="destructive">
                    Delete
                  </Button>
                }
                title="Delete this task?"
                confirmLabel="Delete task"
                destructive
                onConfirm={() =>
                  remove.mutateAsync({ id: task.id, confirm: true })
                }
              >
                It stops running. Its history stays in Activity.
              </ConfirmAction>
            </>
          }
        />
      )}
    </FormStack>
  );
}
