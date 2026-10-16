import { comparisonRuntimeFiles } from "./comparison-runtime";
import { useId, useSyncExternalStore } from "react";
import { Bell } from "lucide-react";
import {
  modelStatus,
  prepareComparisonModel,
  subscribeModel,
} from "./comparison-assets";
import { Button } from "../components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "../components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../components/ui/tooltip";

export function RequiredSpeechModel() {
  const state = useSyncExternalStore(subscribeModel, modelStatus);
  const statusId = useId();
  const pending = state.status !== "ready";
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="notification-trigger relative"
                  aria-label="Notifications"
                  aria-describedby={statusId}
                />
              }
            />
          }
        >
          <Bell className="size-4" aria-hidden="true" />
          {pending && (
            <span
              aria-hidden="true"
              className={`notification-count absolute right-0 top-0 flex size-3.5 items-center justify-center rounded-full text-[9px] font-semibold ${state.status === "error" ? "bg-destructive text-white" : "bg-primary text-primary-foreground"}`}
            >
              1
            </span>
          )}
        </TooltipTrigger>
        <TooltipContent>Notifications</TooltipContent>
      </Tooltip>
      <span id={statusId} className="sr-only" role="status">
        {state.status === "ready"
          ? "No notifications."
          : state.status === "error"
            ? "1 notification: Speech model needs attention."
            : "1 notification: Preparing required speech model."}
      </span>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="practice-ui notification-panel w-80 max-w-[calc(100vw-1rem)] max-h-[var(--available-height)] overflow-y-auto p-4"
      >
        <PopoverTitle>Notifications</PopoverTitle>
        {pending ? (
          <ul aria-label="Notifications" className="m-0 list-none p-0">
            <li className="space-y-3 border-t pt-3">
              <p className="font-medium">Speech model</p>
              <p
                className="break-words text-muted-foreground"
                role={state.status === "error" ? "alert" : "status"}
              >
                {state.message}
              </p>
              {state.status === "loading" ? (
                <progress
                  aria-label="Speech model download"
                  value={state.percent}
                  max={100}
                  className="model-download-progress h-2 w-full"
                />
              ) : (
                <Button
                  size="sm"
                  onClick={() =>
                    void prepareComparisonModel(
                      true,
                      comparisonRuntimeFiles,
                    ).catch(() => {})
                  }
                >
                  Retry model download
                </Button>
              )}
            </li>
          </ul>
        ) : (
          <p className="py-3 text-muted-foreground" role="status">
            No notifications
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
