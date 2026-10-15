import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { screenRoutes, screenPath } from "./routing";
import App from "./App";
import "./style.css";
import "./screens.css";
// Absolute asset/base paths keep nested history links and refreshes reliable.
const basename = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";
const legacy = location.hash.slice(1);
if (
  ["home", "types", "sections", "mocks", "guide", "history"].includes(legacy)
) {
  history.replaceState(
    null,
    "",
    (basename === "/" ? "" : basename) + screenPath(legacy),
  );
}
const router = createBrowserRouter(
  [{ element: <App />, children: screenRoutes }],
  { basename },
);
createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router} />,
);
