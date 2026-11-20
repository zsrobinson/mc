import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { keys } from "./queries";

/**
 * Subscribe to the console's server-sent events and write each snapshot into
 * the logs query. Returns whether the stream is currently open, so polling
 * can stand in while it reconnects.
 */
export function useLogStream(name: string) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource(
      `/api/console?${new URLSearchParams({ name })}`,
    );
    const onLogs = (event: MessageEvent<string>) => {
      try {
        queryClient.setQueryData(keys.logs(name), JSON.parse(event.data));
        setOpen(true);
      } catch {
        // Ignore malformed frames; the next snapshot replaces them.
      }
    };
    source.addEventListener("logs", onLogs);
    source.addEventListener("error", () => setOpen(false));
    return () => {
      source.close();
      setOpen(false);
    };
  }, [name, queryClient]);

  return open;
}
