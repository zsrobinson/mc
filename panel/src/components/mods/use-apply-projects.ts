import { useControlMutation } from "@/lib/mutations";
import type { Server } from "@/lib/types";

type Payload = Partial<Pick<Server, "mods" | "datapacks">>;

/** apply-config backs up, then recreates the server with the new list. */
export function useApplyProjects(name: string, success: string) {
  return useControlMutation<Payload, Server>("apply-config", name, { success });
}
