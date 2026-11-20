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
  FileIcon,
  GlobeIcon,
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
const PAGES = [
  ["Overview", "/servers/$name", LayoutDashboardIcon, "activity"],
  ["Console", "/servers/$name/console", TerminalIcon, "activity"],
  ["Players", "/servers/$name/players", UsersIcon, "activity"],
  ["Mods", "/servers/$name/mods", BlocksIcon, "content"],
  ["World", "/servers/$name/world", GlobeIcon, "content"],
  ["Backups", "/servers/$name/backups", ArchiveIcon, "manage"],
  ["Files", "/servers/$name/files", FileIcon, "manage"],
  ["Settings", "/servers/$name/settings", SettingsIcon, "manage"],
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
          ["kill", "Kill process", ZapIcon],
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
            ? server.players
            : undefined,
        active: server.name === current,
        render: (
          <Link
            to={
              server.state === "crashed"
                ? "/servers/$name/console"
                : "/servers/$name"
            }
            params={{ name: server.name }}
          />
        ),
        onSelect: () =>
          void navigate({
            to: "/servers/$name",
            params: { name: server.name },
          }),
        actions: serverActions(server, onPower),
        children: PAGES.map(([label, to, Icon, section]) => ({
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
              : pathname.startsWith(to.replace("$name", server.name)),
        })),
      })),
    },
  ];
}
