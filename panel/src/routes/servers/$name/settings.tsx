import {
  createFileRoute,
  Link,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import { PageHeader, PageStack, PageTitle } from "@zsrobinson/shell";
import { SectionNav } from "@zsrobinson/shell/blocks/section-nav";
import { limitsQuery, propertiesQuery } from "@/lib/queries";

export const Route = createFileRoute("/servers/$name/settings")({
  staticData: { crumb: "Settings" },
  loader: ({ context: { queryClient }, params }) => {
    void queryClient.prefetchQuery(propertiesQuery(params.name));
    void queryClient.prefetchQuery(limitsQuery);
  },
  component: SettingsLayout,
});

const SECTIONS = [
  ["game", "Game", "/servers/$name/settings"],
  ["resources", "Resources", "/servers/$name/settings/resources"],
  ["icon", "Icon", "/servers/$name/settings/icon"],
  ["server", "Rename & delete", "/servers/$name/settings/server"],
] as const;

/** Settings split into sections, each its own page with its own URL. */
function SettingsLayout() {
  const { name } = Route.useParams();
  const section = useLocation({
    select: (l) => l.pathname.split("/")[4] || "game",
  });
  return (
    <PageStack className="w-full max-w-3xl">
      <PageHeader>
        <PageTitle>Settings</PageTitle>
      </PageHeader>
      <SectionNav
        label="Settings sections"
        items={SECTIONS.map(([id, label, to]) => ({
          id,
          label,
          active: section === id,
          render: (
            <Link to={to} params={{ name }} activeOptions={{ exact: true }} />
          ),
        }))}
      />
      <Outlet />
    </PageStack>
  );
}
