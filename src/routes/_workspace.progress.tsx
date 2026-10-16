import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_workspace/progress")({
  staticData: { screen: { page: "home", view: "progress" } },
});
