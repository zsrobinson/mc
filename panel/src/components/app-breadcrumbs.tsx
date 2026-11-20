import { Fragment } from "react";
import { Link, useMatches } from "@tanstack/react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@zsrobinson/shell/ui/breadcrumb";

type Crumb = { label: string; to: string; params?: Record<string, string> };

/** Servers › name › section, derived from the matched routes. */
export function AppBreadcrumbs() {
  const matches = useMatches();
  const crumbs: Crumb[] = [{ label: "Dashboard", to: "/" }];

  for (const match of matches) {
    const params = match.params as Record<string, string>;
    if (match.routeId === "/servers/$name") {
      crumbs.push({ label: params.name, to: "/servers/$name", params });
    } else if (match.staticData.crumb) {
      crumbs.push({
        label: match.staticData.crumb,
        to: match.fullPath,
        params,
      });
    }
  }

  return (
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <Fragment key={crumb.to}>
              {index > 0 ? (
                <BreadcrumbSeparator className="max-sm:hidden" />
              ) : null}
              <BreadcrumbItem className={last ? "min-w-0" : "max-sm:hidden"}>
                {last ? (
                  <BreadcrumbPage className="truncate">
                    {crumb.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    render={<Link to={crumb.to} params={crumb.params} />}
                  >
                    {crumb.label}
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
