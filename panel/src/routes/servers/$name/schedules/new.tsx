import { createFileRoute } from "@tanstack/react-router";
import { FormStack, PageHeader, PageTitle } from "@zsrobinson/shell";
import { TaskForm } from "@/components/schedules/task-form";

export const Route = createFileRoute("/servers/$name/schedules/new")({
  staticData: {
    crumb: "New task",
    parentCrumb: { label: "Schedules", to: "/servers/$name/schedules" },
  },
  component: NewTaskPage,
});

function NewTaskPage() {
  const { name } = Route.useParams();
  return (
    <FormStack>
      <PageHeader>
        <PageTitle>New task</PageTitle>
      </PageHeader>
      <TaskForm name={name} />
    </FormStack>
  );
}
