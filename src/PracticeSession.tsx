import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useScreen } from "./routing";
import { Preflight, Runner, type PracticePlan, type Result } from "./Runner";

/** A route-scoped attempt owns its plan, microphone and runner lifecycle. */
export function PracticeSession({
  plan: initialPlan,
  onComplete,
}: {
  plan: PracticePlan;
  onComplete: (result: Result) => void;
}) {
  const [plan] = useState(initialPlan);
  const [running, setRunning] = useState(false);
  const started = useRef(false);
  const stream = useRef<MediaStream | null>(null);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isRun = pathname.endsWith("/run");
  const { mode = "", practiceId = "" } = useScreen();
  useEffect(() => {
    if (isRun && !started.current) {
      // Reload/forward cannot restore a live recording or wall-clock deadline.
      void navigate({
        to: "/practice/$mode/$practiceId",
        params: { mode, practiceId },
        replace: true,
      });
    } else if (!isRun) {
      started.current = false;
      setRunning(false);
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
    }
  }, [pathname, isRun, mode, practiceId, navigate]);
  useEffect(
    () => () => stream.current?.getTracks().forEach((track) => track.stop()),
    [],
  );
  if (isRun && running)
    return (
      <Runner plan={plan} stream={stream.current} onComplete={onComplete} />
    );
  return (
    <Preflight
      plan={plan}
      onStart={(value) => {
        started.current = true;
        stream.current = value;
        setRunning(true);
        void navigate({
          to: "/practice/$mode/$practiceId/run",
          params: { mode, practiceId },
        });
      }}
      onCancel={() => void navigate({ to: "/" })}
    />
  );
}
