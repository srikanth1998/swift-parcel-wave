import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>): { ref?: string } => ({
    ...(typeof search.ref === "string" ? { ref: search.ref } : {}),
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/auth",
      search: search.ref ? { ref: search.ref } : {},
    });
  },
  component: () => null,
});
