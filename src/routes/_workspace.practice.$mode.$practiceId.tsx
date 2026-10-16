import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_workspace/practice/$mode/$practiceId")({
  staticData: { screen: { page: "practice" } },
});
