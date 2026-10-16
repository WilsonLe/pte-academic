import { startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { StartClient } from "@tanstack/react-start/client";
import { prepareComparisonModel } from "./speech/comparison-assets";
import { comparisonRuntimeFiles } from "./speech/comparison-runtime";
import { isScreenId, screenPath } from "./routing";
const legacy = location.hash.slice(1);
if (isScreenId(legacy)) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  history.replaceState(null, "", base + screenPath(legacy));
}
// Required preparation starts once, including direct links into active practice.
void prepareComparisonModel(false, comparisonRuntimeFiles).catch(() => {});
startTransition(() => {
  hydrateRoot(document, <StartClient />);
});
