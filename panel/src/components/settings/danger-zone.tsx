import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@zsrobinson/shell/ui/card";
import { Separator } from "@zsrobinson/shell/ui/separator";

import type { Server } from "@/lib/types";
import { DeleteSection } from "./delete-section";
import { RenameSection } from "./rename-section";

/** Actions that change how players reach the server or remove it. */
export function DangerZone({ server }: { server: Server }) {
  return (
    <Card size="sm" className="ring-destructive/25 dark:ring-destructive/30">
      <CardHeader>
        <CardTitle>Danger zone</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-[1fr_auto_1fr]">
        <RenameSection key={server.name} server={server} />
        <Separator orientation="vertical" className="max-md:hidden" />
        <Separator className="md:hidden" />
        <DeleteSection name={server.name} />
      </CardContent>
    </Card>
  );
}
