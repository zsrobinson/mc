import { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardAction,
  CardContent,
} from "@zsrobinson/shell/ui/card";
import { Button } from "@zsrobinson/shell/ui/button";
import { DetailList, DetailRow } from "@zsrobinson/shell/blocks/detail-list";
import type { Server } from "@/lib/types";
import { MinecraftCard } from "./minecraft-card";
import { LoaderCard } from "./loader-card";
export function VersionCard({ server }: { server: Server }) {
  const [upgrade, setUpgrade] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Version</CardTitle>
        <CardAction>
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={upgrade}
            onClick={() => setUpgrade((v) => !v)}
          >
            Upgrade
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <DetailList>
          <DetailRow label="Minecraft">{server.version}</DetailRow>
          <DetailRow label="Fabric loader">
            {server.fabricLoader ?? "Unavailable"}
          </DetailRow>
          <DetailRow label="Java">
            <span className="font-mono text-xs">{server.javaTag}</span>
          </DetailRow>
        </DetailList>
        {upgrade ? (
          <>
            <MinecraftCard server={server} />
            <LoaderCard server={server} />
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
