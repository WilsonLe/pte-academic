import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_workspace/guide/$topicId")({
  validateSearch: (search: Record<string, unknown>): { section?: number } => {
    const section = search.section;
    return typeof section === "number" &&
      Number.isSafeInteger(section) &&
      section > 0
      ? { section }
      : {};
  },
  staticData: { screen: { page: "guide" } },
});
