import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { Button } from "@zsrobinson/shell/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@zsrobinson/shell/ui/card";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";
import { RenameCard } from "@/components/settings/rename-card";
import { useServer } from "@/lib/use-server";

export const Route = createFileRoute("/servers/$name/settings/server")({
  staticData: { crumb: "Rename & delete" },
  component: ServerSettings,
});

function ServerSettings() {
  const { name } = Route.useParams();
  const { data: server } = useServer(name);
  return (
    <>
      {server ? (
        <RenameCard key={server.name} server={server} />
      ) : (
        <Skeleton className="h-48 w-full rounded-2xl" />
      )}
      <Card className="ring-destructive/25 dark:ring-destructive/30">
        <CardHeader>
          <CardTitle>Delete server</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Stops the server and removes it from this panel. Its world, settings
          and mods are kept in a retained backup first.
        </CardContent>
        <CardFooter>
          <Button
            variant="destructive"
            render={<Link to="/servers/$name/delete" params={{ name }} />}
            nativeButton={false}
          >
            Delete server
            <ChevronRightIcon data-icon="inline-end" />
          </Button>
        </CardFooter>
      </Card>
    </>
  );
}
