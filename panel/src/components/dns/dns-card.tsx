import { Button } from "@zsrobinson/shell/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@zsrobinson/shell/ui/card";
import { Spinner } from "@zsrobinson/shell/ui/spinner";

import type { Server } from "@/lib/types";
import {
  DetailList,
  DetailRow,
  Unavailable,
} from "@zsrobinson/shell/blocks/detail-list";
import { DnsBadge } from "./dns-badge";
import { FixDnsButton } from "./fix-dns-button";
import { needsFix, useServerDns } from "./use-server-dns";

export function DnsCard({ server }: { server: Server }) {
  const { dns, checking, recheck } = useServerDns(server);
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex min-h-8 items-center">DNS</CardTitle>
        <CardAction className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={checking}
            onClick={recheck}
          >
            {checking ? <Spinner data-icon="inline-start" /> : null}
            Check
          </Button>
          {dns && needsFix(dns) && dns.managed !== false ? (
            <FixDnsButton name={server.name} dns={dns} />
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent>
        <DetailList>
          <DetailRow label="SRV record">
            {dns ? (
              <span className="truncate font-mono text-code">
                {dns.recordName}
              </span>
            ) : (
              <Unavailable>Not reported</Unavailable>
            )}
          </DetailRow>
          <DetailRow label="Status">
            {dns ? (
              <DnsBadge dns={dns} />
            ) : (
              <Unavailable>Not reported</Unavailable>
            )}
          </DetailRow>
          {dns?.managed === false ? (
            <DetailRow label="Managed by">
              <Unavailable>Another tool; not changed here</Unavailable>
            </DetailRow>
          ) : null}
        </DetailList>
      </CardContent>
    </Card>
  );
}
