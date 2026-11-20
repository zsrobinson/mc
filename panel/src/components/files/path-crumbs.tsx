import { Fragment } from "react";
import { Link } from "@tanstack/react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@zsrobinson/shell/ui/breadcrumb";

/** The data directory path as clickable segments. */
export function PathCrumbs({ name, path }: { name: string; path: string }) {
  const parts = path.split("/").filter(Boolean);
  return (
    <Breadcrumb>
      <BreadcrumbList className="gap-1 font-mono text-xs sm:gap-1.5">
        <BreadcrumbItem>
          {parts.length === 0 ? (
            <BreadcrumbPage>data</BreadcrumbPage>
          ) : (
            <BreadcrumbLink
              render={
                <Link
                  to="/servers/$name/files"
                  params={{ name }}
                  search={{ path: "" }}
                />
              }
            >
              data
            </BreadcrumbLink>
          )}
        </BreadcrumbItem>
        {parts.map((part, index) => {
          const to = parts.slice(0, index + 1).join("/");
          const last = index === parts.length - 1;
          return (
            <Fragment key={to}>
              <BreadcrumbSeparator>/</BreadcrumbSeparator>
              <BreadcrumbItem>
                {last ? (
                  <BreadcrumbPage>{part}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    render={
                      <Link
                        to="/servers/$name/files"
                        params={{ name }}
                        search={{ path: to }}
                      />
                    }
                  >
                    {part}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
