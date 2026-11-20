import { Badge } from "@zsrobinson/shell/ui/badge";

import type { ServerDns } from "@/lib/types";

const LABEL: Record<ServerDns["status"], string> = {
  ok: "DNS ok",
  missing: "DNS missing",
  drifted: "DNS out of date",
  unconfigured: "DNS not set up",
};

export function DnsBadge({ dns }: { dns: ServerDns }) {
  const broken = dns.status === "missing" || dns.status === "drifted";
  return (
    <Badge
      variant={
        broken ? "destructive" : dns.status === "ok" ? "outline" : "secondary"
      }
    >
      {LABEL[dns.status]}
    </Badge>
  );
}
