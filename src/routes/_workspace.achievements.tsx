import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_workspace/achievements")({
  staticData: { screen: { page: "home", view: "badges" } },
});
