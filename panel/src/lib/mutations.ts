import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "@zsrobinson/shell";

import { control, errorMessage } from "./api";
import { withIntent } from "./intent";
import { keys } from "./queries";
import type { Server } from "./types";

type Message<TResult, TPayload> =
  string | ((result: TResult, payload: TPayload) => string);

type Options<TResult, TPayload> = {
  /** Toast shown on success. */
  success?: Message<TResult, TPayload>;
  onSuccess?: (result: TResult, payload: TPayload) => void;
};

export function refreshServer(queryClient: QueryClient, name: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.server(name) }),
    queryClient.invalidateQueries({ queryKey: keys.servers }),
    queryClient.invalidateQueries({ queryKey: keys.audit(undefined) }),
  ]);
}

/**
 * A control verb as a mutation. Errors become toasts carrying the server's
 * message; success refreshes everything cached for the server.
 */
export function useControlMutation<TPayload extends object | void, TResult>(
  verb: string,
  name: string | undefined,
  { success, onSuccess }: Options<TResult, TPayload> = {},
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["control", verb, name],
    mutationFn: (payload: TPayload) =>
      control<TResult>(verb, name, payload ?? {}),
    onSuccess: (result, payload) => {
      if (success)
        toast.success(
          typeof success === "function" ? success(result, payload) : success,
        );
      onSuccess?.(result, payload);
    },
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => (name ? refreshServer(queryClient, name) : undefined),
  });
}

const PENDING_STATE = {
  start: "starting",
  stop: "stopping",
  restart: "restarting",
  kill: "stopping",
} as const;

const DONE_MESSAGE = {
  start: "Server started",
  stop: "Server stopped",
  restart: "Server restarted",
  kill: "Server force-stopped",
} as const;

export type PowerAction = keyof typeof PENDING_STATE;

function patchState(
  queryClient: QueryClient,
  name: string,
  update: (server: Server) => Server,
) {
  queryClient.setQueryData<Server>(keys.status(name), (server) =>
    server ? update(server) : server,
  );
  queryClient.setQueryData<Server[]>(keys.servers, (servers) =>
    servers?.map((server) => (server.name === name ? update(server) : server)),
  );
}

/** Start, stop, restart or kill, showing the transitional state at once. */
export function usePowerAction(name: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["power", name],
    mutationFn: (action: PowerAction) =>
      action === "kill"
        ? withIntent(name, "kill", (intent) =>
            control<Server>("kill", name, {
              confirm: true,
              confirmName: name,
              intent,
            }),
          )
        : control<Server>(action, name, {}),
    onMutate: async (action) => {
      await queryClient.cancelQueries({ queryKey: keys.status(name) });
      const previous = queryClient.getQueryData<Server>(keys.status(name));
      patchState(queryClient, name, (server) => ({
        ...server,
        state: PENDING_STATE[action],
      }));
      return { previous };
    },
    onSuccess: (server, action) => {
      if (server && typeof server === "object" && "state" in server)
        patchState(queryClient, name, () => server);
      toast.success(DONE_MESSAGE[action]);
    },
    onError: (error, _action, context) => {
      if (context?.previous)
        patchState(queryClient, name, () => context.previous!);
      toast.error(errorMessage(error));
    },
    onSettled: () => refreshServer(queryClient, name),
  });
}
