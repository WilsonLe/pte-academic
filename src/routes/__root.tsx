import { ClientOnly, createRootRoute, Outlet } from "@tanstack/react-router";
import { RootDocument } from "../RootDocument";
export const Route = createRootRoute({
  component: Root,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width,initial-scale=1.0" },
      { name: "theme-color", content: "#0a0a0a" },
      {
        name: "description",
        content:
          "PTE Academic practice by question type, section or full mock. Responses stay on your device.",
      },
      { title: "PTE Studio" },
    ],
  }),
});

// Hydrate the public document first. Mount browser-only route content afterwards
// so the SPA shell and every deep-link entry share the same initial tree.
function Root() {
  return (
    <RootDocument>
      <ClientOnly>
        <Outlet />
      </ClientOnly>
    </RootDocument>
  );
}
