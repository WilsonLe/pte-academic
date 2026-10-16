import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_workspace/guide/$topicId")({
  staticData: { screen: { page: "guide" } },
});
