import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
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
  const preflightPath = pathname.replace(/\/run$/, "");
  useEffect(() => {
    if (isRun && !started.current) {
      // Reload/forward cannot restore a live recording or wall-clock deadline.
      void navigate(preflightPath, { replace: true });
    } else if (!isRun) {
      started.current = false;
      setRunning(false);
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
    }
  }, [pathname, isRun, preflightPath, navigate]);
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
        void navigate(preflightPath + "/run");
      }}
      onCancel={() => void navigate("/")}
    />
  );
}
