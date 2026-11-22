import { useQuery } from "@tanstack/react-query";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import {
  ArchiveIcon,
  BlocksIcon,
  CalendarClockIcon,
  FolderIcon,
  GlobeIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  ListIcon,
  PlusIcon,
  SettingsIcon,
  TerminalIcon,
  UsersIcon,
  PlayIcon,
  SquareIcon,
  RotateCwIcon,
  ZapIcon,
} from "lucide-react";
import type { NavAction, NavGroup } from "@zsrobinson/shell";
import { serversQuery } from "@/lib/queries";
import { parsePlayers } from "@/lib/format";
import type { Server } from "@/lib/types";
import { stateLabel } from "@/lib/state";
import { StateDot } from "./state-badge";
import type { PowerAction } from "@/lib/mutations";
/**
 * Day-to-day pages first, then the server's data and history, then
 * configuration. `also` lists other paths that belong to the page.
 */
const PAGES = [
  ["Overview", "/servers/$name", LayoutDashboardIcon, "run", []],
  ["Console", "/servers/$name/console", TerminalIcon, "run", ["logs"]],
  ["Players", "/servers/$name/players", UsersIcon, "run", []],
  ["Files", "/servers/$name/files", FolderIcon, "data", []],
  ["Backups", "/servers/$name/backups", ArchiveIcon, "data", []],
  ["Schedules", "/servers/$name/schedules", CalendarClockIcon, "data", []],
  ["Activity", "/servers/$name/activity", HistoryIcon, "data", []],
  ["Mods", "/servers/$name/mods", BlocksIcon, "configure", ["software"]],
  ["World", "/servers/$name/world", GlobeIcon, "configure", []],
  [
    "Settings",
    "/servers/$name/settings",
    SettingsIcon,
    "configure",
    ["delete"],
  ],
] as const;
export function serverActions(
  server: Server,
  onPower: (server: Server, verb: PowerAction) => void,
): NavAction[] {
  const busy = ["starting", "stopping", "restarting", "creating"].includes(
    server.state,
  );
  return (
    server.state === "running" || busy
      ? [
          ["restart", "Restart", RotateCwIcon],
          ["stop", "Stop", SquareIcon],
          ["kill", "Force stop", ZapIcon],
        ]
      : [["start", "Start", PlayIcon]]
  ).map(([id, label, Icon]) => ({
    id: id as string,
    label: label as string,
    icon: typeof Icon !== "string" ? <Icon /> : null,
    onSelect: () => onPower(server, id as PowerAction),
    disabled: busy && id !== "kill",
    presentation:
      id === "start" ? "primary" : id === "kill" ? "menu" : "outline",
    destructive: id === "kill",
  }));
}
export function useServerNavigation(
  onPower: (server: Server, verb: PowerAction) => void,
): NavGroup[] {
  const { data: servers } = useQuery(serversQuery);
  const { name: current } = useParams({ strict: false });
  const pathname = useLocation({ select: (l) => l.pathname });
  const navigate = useNavigate();
  return [
    {
      id: "overview",
      items: [
        {
          id: "dashboard",
          label: "Dashboard",
          icon: <LayoutDashboardIcon />,
          render: <Link to="/" />,
          onSelect: () => void navigate({ to: "/" }),
          active: pathname === "/",
        },
        {
          id: "activity",
          label: "Activity",
          icon: <HistoryIcon />,
          render: <Link to="/activity" />,
          onSelect: () => void navigate({ to: "/activity" }),
          active: pathname === "/activity",
        },
      ],
    },
    {
      id: "commands",
      hidden: true,
      items: [
        {
          id: "list",
          label: "Servers",
          icon: <ListIcon />,
          render: <Link to="/" />,
          onSelect: () => void navigate({ to: "/" }),
        },
        {
          id: "new",
          label: "New server",
          icon: <PlusIcon />,
          render: <Link to="/new" />,
          onSelect: () => void navigate({ to: "/new" }),
        },
      ],
    },
    {
      id: "servers",
      label: "Servers",
      render: <Link to="/" />,
      action: <Link to="/new" aria-label="New server" />,
      actionLabel: "New server",
      items: (servers ?? []).map((server) => ({
        id: server.name,
        label: server.name,
        icon: (
          <span className="flex size-5 items-center justify-center text-xs font-medium">
            {server.name.charAt(0).toUpperCase()}
          </span>
        ),
        status: <StateDot state={server.state} />,
        statusLabel: stateLabel(server.state),
        badge:
          (parsePlayers(server.players)?.online ?? 0) > 0
            ? String(parsePlayers(server.players)?.online)
            : undefined,
        active: server.name === current,
        // A crashed server opens on Overview, where the crash is explained.
        render: <Link to="/servers/$name" params={{ name: server.name }} />,
        onSelect: () =>
          void navigate({
            to: "/servers/$name",
            params: { name: server.name },
          }),
        actions: serverActions(server, onPower),
        children: PAGES.map(([label, to, Icon, section, also]) => ({
          id: label,
          label,
          icon: <Icon />,
          section,
          render: <Link to={to} params={{ name: server.name }} />,
          onSelect: () => void navigate({ to, params: { name: server.name } }),
          active:
            to === "/servers/$name"
              ? pathname === `/servers/${server.name}` ||
                pathname === `/servers/${server.name}/`
              : [to.split("/").at(-1), ...also].some(
                  (segment) =>
                    pathname === `/servers/${server.name}/${segment}` ||
                    pathname.startsWith(`/servers/${server.name}/${segment}/`),
                ),
        })),
      })),
    },
  ];
}
