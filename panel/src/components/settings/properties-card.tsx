import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@zsrobinson/shell/ui/card";
import { Skeleton } from "@zsrobinson/shell/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@zsrobinson/shell/ui/tabs";

import { propertiesQuery } from "@/lib/queries";
import { QueryError } from "@zsrobinson/shell/blocks/query-error";
import { PropertiesForm } from "./properties-form";
import { RawProperties } from "./raw-properties";

export function PropertiesCard({ name }: { name: string }) {
  const properties = useQuery(propertiesQuery(name));

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Game settings</CardTitle>
      </CardHeader>
      <CardContent>
        {properties.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3, 4, 5].map((key) => (
              <Skeleton key={key} className="h-14 w-full" />
            ))}
          </div>
        ) : properties.isError ? (
          <QueryError
            title="Settings could not be loaded"
            error={properties.error}
            onRetry={() => properties.refetch()}
          />
        ) : (
          <Tabs defaultValue="form" className="gap-4">
            <TabsList>
              <TabsTrigger value="form">Form</TabsTrigger>
              <TabsTrigger value="raw">server.properties</TabsTrigger>
            </TabsList>
            <TabsContent value="form">
              <PropertiesForm
                key={properties.dataUpdatedAt}
                name={name}
                initial={properties.data.values}
              />
            </TabsContent>
            <TabsContent value="raw">
              <RawProperties
                key={properties.dataUpdatedAt}
                name={name}
                initial={properties.data.raw}
              />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
