import { startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";
import { isScreenId, screenPath } from "./routing";
const legacy = location.hash.slice(1);
if (isScreenId(legacy)) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  history.replaceState(null, "", base + screenPath(legacy));
}
startTransition(() => {
  hydrateRoot(document, <StartClient />);
});
