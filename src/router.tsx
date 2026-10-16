import { createRouter } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import { createLocalQueryClient } from "./queries";
export function getRouter() {
  // A new instance per app, never a server-global cache of learner data.
  const queryClient = createLocalQueryClient();
  return createRouter({
    routeTree,
    basepath: import.meta.env.BASE_URL,
    defaultPreload: false,
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
