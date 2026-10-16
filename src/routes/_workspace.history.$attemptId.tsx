import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_workspace/history/$attemptId")({
  staticData: { screen: { page: "history" } },
});
