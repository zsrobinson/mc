import { Button } from "@zsrobinson/shell/ui/button";
import { Spinner } from "@zsrobinson/shell/ui/spinner";

import { useControlMutation } from "@/lib/mutations";
import type { ServerDns } from "@/lib/types";
import { ConfirmAction } from "@zsrobinson/shell/blocks/confirm-action";

export function FixDnsButton({
  name,
  dns,
  size = "sm",
}: {
  name: string;
  dns: ServerDns;
  size?: "xs" | "sm";
}) {
  const fix = useControlMutation<{ confirm: true }, ServerDns>(
    "fix-dns",
    name,
    {
      success: "DNS record fixed",
    },
  );
  return (
    <ConfirmAction
      trigger={
        <Button size={size} variant="outline" disabled={fix.isPending}>
          {fix.isPending ? <Spinner data-icon="inline-start" /> : null}
          Fix DNS
        </Button>
      }
      title="Fix the DNS record?"
      confirmLabel="Fix DNS"
      onConfirm={() => fix.mutateAsync({ confirm: true })}
    >
      The SRV record <span className="font-mono">{dns.recordName}</span> is
      written to point at this server&apos;s current port.
    </ConfirmAction>
  );
}
