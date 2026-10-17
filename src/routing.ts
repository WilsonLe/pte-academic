import { useMatches } from "@tanstack/react-router";

type Screen = {
  page: string;
  view?: string;
  guideId?: string;
  attemptId?: string;
  mode?: string;
  practiceId?: string;
  sectionId?: string;
  topicId?: string;
  learnSection?: number;
};
declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    screen?: Pick<Screen, "page" | "view">;
  }
}
export function useScreen(): Screen {
  const matches = useMatches();
  const match = matches.at(-1)!;
  const section = (match.search as Record<string, unknown>).section;
  return {
    page: "missing",
    ...match.staticData.screen,
    ...match.params,
    learnSection: typeof section === "number" ? section : undefined,
  };
}
const screenPaths = {
  home: "/",
  types: "/types",
  sections: "/sections",
  mocks: "/mocks",
  guide: "/guide",
  history: "/history",
} as const;
export type ScreenId = keyof typeof screenPaths;
export const isScreenId = (id: string): id is ScreenId =>
  Object.hasOwn(screenPaths, id);
export const screenPath = (id: ScreenId) => screenPaths[id];
