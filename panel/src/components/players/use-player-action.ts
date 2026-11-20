import { useControlMutation } from "@/lib/mutations";
import type { PlayerAction } from "@/lib/types";

export type PlayerActionPayload = {
  action: PlayerAction;
  player?: string;
  reason?: string;
};

const DONE: Record<PlayerAction, (player?: string) => string> = {
  kick: (p) => `Kicked ${p}`,
  "whitelist-add": (p) => `Added ${p} to the whitelist`,
  "whitelist-remove": (p) => `Removed ${p} from the whitelist`,
  "whitelist-on": () => "Whitelist turned on",
  "whitelist-off": () => "Whitelist turned off",
  op: (p) => `Made ${p} an operator`,
  deop: (p) => `Removed operator from ${p}`,
  ban: (p) => `Banned ${p}`,
  pardon: (p) => `Unbanned ${p}`,
  "ban-ip": (p) => `Banned ${p}`,
  "pardon-ip": (p) => `Unbanned ${p}`,
};

export function usePlayerAction(name: string) {
  const mutation = useControlMutation<PlayerActionPayload, unknown>(
    "player-action",
    name,
    { success: (_, payload) => DONE[payload.action](payload.player) },
  );
  /** True while this exact action on this player is in flight. */
  const isPending = (action: PlayerAction, player?: string) =>
    mutation.isPending &&
    mutation.variables?.action === action &&
    mutation.variables?.player === player;
  return { ...mutation, isPendingFor: isPending };
}

export const PLAYER_NAME = /^[A-Za-z0-9_]{3,16}$/;
export const IP_ADDRESS =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$|^[0-9a-f:]+$/i;
