import { comparisonRuntimeFiles } from "./comparison-runtime";
import { useSyncExternalStore } from "react";
import {
  modelStatus,
  prepareComparisonModel,
  subscribeModel,
} from "./comparison-assets";
import { Button } from "../components/ui/button";
export function RequiredSpeechModel() {
  const state = useSyncExternalStore(subscribeModel, modelStatus);
  if (state.status === "ready") return null;
  return (
    <aside
      aria-label="Required speech model"
      className="required-speech-model flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b bg-background px-4 py-2 text-xs"
    >
      <p
        className="min-w-0 flex-1"
        role={state.status === "error" ? "alert" : "status"}
      >
        {state.message}
      </p>
      {state.status === "loading" ? (
        <progress
          aria-label="Speech model download"
          value={state.percent}
          max={100}
          className="h-2 w-28 shrink-0"
        />
      ) : (
        <Button
          size="sm"
          className="ml-auto shrink-0"
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
