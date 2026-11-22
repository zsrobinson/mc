import { createFileRoute } from "@tanstack/react-router";
import { Page, PageHeader, PageTitle } from "@zsrobinson/shell";
import {
  ActivityLog,
  type OutcomeFilter,
} from "@/components/activity/activity-log";

const outcome = (value: unknown): OutcomeFilter =>
  value === "ok" || value === "error" ? value : "all";

export const Route = createFileRoute("/activity")({
  staticData: { crumb: "Activity" },
  validateSearch: (s: Record<string, unknown>): { outcome?: OutcomeFilter } =>
    outcome(s.outcome) === "all" ? {} : { outcome: outcome(s.outcome) },
  component: ActivityPage,
});

function ActivityPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Page>
      <PageHeader>
        <PageTitle>Activity</PageTitle>
      </PageHeader>
      <ActivityLog
        outcome={search.outcome ?? "all"}
        onOutcomeChange={(next) =>
          void navigate({
            search: next === "all" ? {} : { outcome: next },
            replace: true,
          })
        }
      />
    </Page>
  );
}
