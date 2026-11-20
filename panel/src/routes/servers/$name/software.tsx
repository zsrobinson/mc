import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/servers/$name/software")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/servers/$name/mods",
      params,
      search: { kind: "mod" },
    });
  },
});
