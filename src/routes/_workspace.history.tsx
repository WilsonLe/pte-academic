import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_workspace/history")({
  staticData: { screen: { page: "history" } },
});
