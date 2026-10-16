import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_workspace/sections/$sectionId")({
  staticData: { screen: { page: "sections" } },
});
