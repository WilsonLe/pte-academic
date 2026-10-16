import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_workspace/mocks")({
  staticData: { screen: { page: "mocks" } },
});
