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

/** Dashboard › server › section › page, derived from the matched routes. */
export function AppBreadcrumbs() {
  const matches = useMatches();
  const crumbs: Crumb[] = [{ label: "Dashboard", to: "/" }];

  for (const match of matches) {
    const params = match.params as Record<string, string>;
    const data = match.staticData;
    if (match.routeId === "/servers/$name") {
      crumbs.push({ label: params.name, to: "/servers/$name", params });
      continue;
    }
    if (data.parentCrumb)
      crumbs.push({
        label: data.parentCrumb.label,
        to: data.parentCrumb.to,
        params,
      });
    const label = data.crumbParam ? params[data.crumbParam] : data.crumb;
    if (label) crumbs.push({ label, to: match.fullPath, params });
  }
  // Index routes repeat their layout's crumb.
  const unique = crumbs.filter(
    (crumb, index) => index === 0 || crumb.label !== crumbs[index - 1].label,
  );

  return (
    <Breadcrumb>
      <BreadcrumbList className="flex-nowrap">
        {unique.map((crumb, index) => {
          const last = index === unique.length - 1;
          return (
            <Fragment key={`${crumb.to}:${crumb.label}`}>
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
