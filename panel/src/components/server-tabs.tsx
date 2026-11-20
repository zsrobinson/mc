import { Link } from "@tanstack/react-router";

const TABS = [
  { label: "Overview", to: "/servers/$name", exact: true },
  { label: "Console", to: "/servers/$name/console" },
  { label: "Players", to: "/servers/$name/players" },
  { label: "Mods", to: "/servers/$name/mods" },
  { label: "Files", to: "/servers/$name/files" },
  { label: "World", to: "/servers/$name/world" },
  { label: "Backups", to: "/servers/$name/backups" },
  { label: "Software", to: "/servers/$name/software" },
  { label: "Settings", to: "/servers/$name/settings" },
] as const satisfies { label: string; to: string; exact?: boolean }[];

/** Section links, styled as Luma line tabs. Scrolls sideways on phones. */
export function ServerTabs({ name }: { name: string }) {
  return (
    <nav
      aria-label="Server sections"
      className="no-scrollbar -mx-4 flex scroll-fade-x overflow-x-auto border-b px-4 md:mx-0 md:scroll-fade-none md:px-0"
    >
      <ul className="flex gap-1">
        {TABS.map((tab) => (
          <li key={tab.label}>
            <Link
              to={tab.to}
              params={{ name }}
              activeOptions={{ exact: "exact" in tab, includeSearch: false }}
              className="relative inline-flex h-10 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap text-foreground/60 outline-none transition-colors after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground after:opacity-0 after:transition-opacity hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[status=active]:text-foreground data-[status=active]:after:opacity-100 dark:text-muted-foreground dark:hover:text-foreground dark:data-[status=active]:text-foreground"
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
