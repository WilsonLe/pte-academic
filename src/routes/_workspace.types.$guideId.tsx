import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_workspace/types/$guideId")({
  staticData: { screen: { page: "types" } },
});
