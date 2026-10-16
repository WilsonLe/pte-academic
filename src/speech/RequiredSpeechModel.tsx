import { comparisonRuntimeFiles } from "./comparison-runtime";
import { useEffect, useSyncExternalStore } from "react";
import {
  modelStatus,
  prepareComparisonModel,
  subscribeModel,
} from "./comparison-assets";
import { Button } from "../components/ui/button";
export function RequiredSpeechModel() {
  const state = useSyncExternalStore(subscribeModel, modelStatus);
  useEffect(() => {
    void prepareComparisonModel(false, comparisonRuntimeFiles).catch(() => {});
  }, []);
  if (state.status === "ready") return null;
  return (
    <aside
      aria-label="Required speech model"
      className="fixed right-3 bottom-20 z-50 max-w-[min(26rem,calc(100vw-1.5rem))] rounded-xl border bg-background p-3 text-xs shadow-lg"
    >
      <p role={state.status === "error" ? "alert" : "status"}>
        {state.message}
      </p>
      {state.status === "loading" ? (
        <progress
          aria-label="Speech model download"
          value={state.percent}
          max={100}
          className="mt-2 w-full"
        />
      ) : (
        <Button
          size="sm"
          className="mt-2"
          onClick={() =>
            void prepareComparisonModel(true, comparisonRuntimeFiles).catch(
              () => {},
            )
          }
        >
          Retry model download
        </Button>
      )}
    </aside>
  );
}
