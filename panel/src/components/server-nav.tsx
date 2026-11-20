import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "@zsrobinson/shell/ui/sidebar";

import { parsePlayers } from "@/lib/format";
import { serversQuery } from "@/lib/queries";
import { StateDot } from "./state-badge";

export function ServerNav() {
  const { data: servers, isPending, isError } = useQuery(serversQuery);
  const { name: current } = useParams({ strict: false });
  const { setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Servers</SidebarGroupLabel>
      <SidebarGroupAction
        title="New server"
        render={<Link to="/new" onClick={close} />}
      >
        <PlusIcon />
        <span className="sr-only">New server</span>
      </SidebarGroupAction>
      <SidebarGroupContent>
        <SidebarMenu>
          {isPending ? (
            <>
              <SidebarMenuSkeleton showIcon />
              <SidebarMenuSkeleton showIcon />
            </>
          ) : isError ? (
            <SidebarMenuItem>
              <span className="px-3 py-2 text-xs text-muted-foreground">
                Server list unavailable
              </span>
            </SidebarMenuItem>
          ) : (
            servers.map((server) => {
              const players = parsePlayers(server.players);
              return (
                <SidebarMenuItem key={server.name}>
                  <SidebarMenuButton
                    isActive={server.name === current}
                    render={
                      <Link
                        to="/servers/$name"
                        params={{ name: server.name }}
                        onClick={close}
                      />
                    }
                  >
                    <StateDot state={server.state} className="mx-1" />
                    <span>{server.name}</span>
                  </SidebarMenuButton>
                  {players && players.online > 0 ? (
                    <SidebarMenuBadge aria-label={`${players.online} online`}>
                      {players.online}
                    </SidebarMenuBadge>
                  ) : null}
                </SidebarMenuItem>
              );
            })
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
