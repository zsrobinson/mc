import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageStack, PageTitle } from "@zsrobinson/shell";
import {
  ActivityLog,
  type OutcomeFilter,
} from "@/components/activity/activity-log";

const outcome = (value: unknown): OutcomeFilter =>
  value === "ok" || value === "error" ? value : "all";

export const Route = createFileRoute("/servers/$name/activity")({
  staticData: { crumb: "Activity" },
  validateSearch: (s: Record<string, unknown>): { outcome?: OutcomeFilter } =>
    outcome(s.outcome) === "all" ? {} : { outcome: outcome(s.outcome) },
  component: ServerActivityPage,
});

function ServerActivityPage() {
  const { name } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PageStack>
      <PageHeader>
        <PageTitle>Activity</PageTitle>
      </PageHeader>
      <ActivityLog
        server={name}
        outcome={search.outcome ?? "all"}
        onOutcomeChange={(next) =>
          void navigate({
            search: next === "all" ? {} : { outcome: next },
            replace: true,
          })
        }
      />
    </PageStack>
  );
}
