import { useMatches } from "react-router";

export const screenRoutes = [
  { index: true, handle: { page: "home", view: "play" } },
  { path: "progress", handle: { page: "home", view: "progress" } },
  { path: "achievements", handle: { page: "home", view: "badges" } },
  { path: "types/:guideId?", handle: { page: "types" } },
  { path: "sections/:sectionId?", handle: { page: "sections" } },
  { path: "mocks", handle: { page: "mocks" } },
  { path: "guide/:topicId?", handle: { page: "guide" } },
  { path: "history/:attemptId?", handle: { page: "history" } },
  { path: "practice/:mode/:practiceId", handle: { page: "practice" } },
  { path: "practice/:mode/:practiceId/run", handle: { page: "practice" } },
  { path: "*", handle: { page: "missing" } },
];
export function useScreen(): {
  page: string;
  view?: string;
  guideId?: string;
  attemptId?: string;
  mode?: string;
  practiceId?: string;
  sectionId?: string;
  topicId?: string;
} {
  const matches = useMatches();
  const match = matches[matches.length - 1];
  return {
    ...(match.handle as { page: string; view?: string }),
    ...match.params,
  };
}
export const screenPath = (id: string) => (id === "home" ? "/" : "/" + id);
