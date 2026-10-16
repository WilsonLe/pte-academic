import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_workspace/")({
  staticData: { screen: { page: "home", view: "play" } },
});
