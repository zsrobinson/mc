import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "@tanstack/react-router";
import {
  ArchiveIcon,
  BlocksIcon,
  FileIcon,
  GlobeIcon,
  LayoutDashboardIcon,
  ListIcon,
  PlusIcon,
  ServerIcon,
  SettingsIcon,
  TerminalIcon,
  UsersIcon,
  WrenchIcon,
} from "lucide-react";
import type { NavGroup } from "@zsrobinson/shell";
import { serversQuery } from "@/lib/queries";

const PAGES = [
  ["Overview", "/servers/$name", LayoutDashboardIcon],
  ["Console", "/servers/$name/console", TerminalIcon],
  ["Players", "/servers/$name/players", UsersIcon],
  ["World", "/servers/$name/world", GlobeIcon],
  ["Mods", "/servers/$name/mods", BlocksIcon],
  ["Software", "/servers/$name/software", WrenchIcon],
  ["Backups", "/servers/$name/backups", ArchiveIcon],
  ["Files", "/servers/$name/files", FileIcon],
  ["Settings", "/servers/$name/settings", SettingsIcon],
] as const;

/** App-specific destinations and data; shell owns the nested sidebar. */
export function useServerNavigation(): NavGroup[] {
  const { data: servers } = useQuery(serversQuery);
  const { name: current } = useParams({ strict: false });
  const pathname = useLocation({ select: (location) => location.pathname });
  return [
    {
      id: "main",
      items: [
        {
          id: "servers",
          label: "All servers",
          icon: <ListIcon />,
          render: <Link to="/" />,
          active: pathname === "/",
        },
        {
          id: "new",
          label: "New server",
          icon: <PlusIcon />,
          render: <Link to="/new" />,
          active: pathname === "/new",
        },
      ],
    },
    {
      id: "servers",
      label: "Servers",
      items: (servers ?? []).map((server) => ({
        id: server.name,
        label: server.name,
        icon: <ServerIcon />,
        active: server.name === current,
        render: <Link to="/servers/$name" params={{ name: server.name }} />,
        children: PAGES.map(([label, to, Icon]) => ({
          id: label,
          label,
          icon: <Icon />,
          render: <Link to={to} params={{ name: server.name }} />,
          active:
            to === "/servers/$name"
              ? pathname === `/servers/${server.name}` ||
                pathname === `/servers/${server.name}/`
              : pathname.startsWith(to.replace("$name", server.name)),
        })),
      })),
    },
  ];
}
