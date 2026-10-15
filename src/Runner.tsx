import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./components/ui/dialog";
import { Button } from "./components/ui/button";
import { useEffect, useRef, useState } from "react";
import { Clock3, Volume2, LogOut, Mic, Check, ArrowRight } from "lucide-react";
import {
  type Question,
  type Answer,
  type Section,
  guideFor,
  sections,
  asset,
  formatTime,
} from "./content";
import { QuestionInput } from "./QuestionInput";
export type PracticePlan = {
  label: string;
  mode: "type" | "section" | "mock";
  questions: Question[];
  minutes: Record<Section, number>;
};
export type Result = {
  id: string;
  label: string;
  date: string;
  questionIds: string[];
  answers: Record<string, Answer>;
  finished: boolean;
};
export function Preflight({
  plan,
  onStart,
  onCancel,
}: {
  plan: PracticePlan;
  onStart: (stream: MediaStream | null) => void;
  onCancel: () => void;
}) {
  const needMic = plan.questions.some((q) => guideFor(q).kind === "speak");
  const needAudio = plan.questions.some((q) => q.audio);
  const [error, setError] = useState("");
  const [mic, setMic] = useState(false);
  const [heard, setHeard] = useState(false);
  const [sample, setSample] = useState("");
  const [recording, setRecording] = useState(false);
  const [installing, setInstalling] = useState(false);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const alive = useRef(true);
  const handed = useRef(false);
  const sampleUrl = useRef("");
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      recorder.current?.state === "recording" && recorder.current.stop();
      if (!handed.current) stream.current?.getTracks().forEach((t) => t.stop());
      if (sampleUrl.current) URL.revokeObjectURL(sampleUrl.current);
    };
  }, []);
  async function testMic() {
    setError("");
    setInstalling(true);
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "Recording is unavailable. Open this site in a modern browser over HTTPS or localhost.",
        );
      const next = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        next.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = next;
      const r = new MediaRecorder(next);
      recorder.current = r;
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      r.onstop = () => {
        if (!alive.current) return;
        if (sampleUrl.current) URL.revokeObjectURL(sampleUrl.current);
        sampleUrl.current = URL.createObjectURL(
          new Blob(chunks, { type: r.mimeType }),
        );
        setSample(sampleUrl.current);
        setRecording(false);
        setMic(true);
      };
      r.start();
      setRecording(true);
      setTimeout(() => {
        if (r.state === "recording") r.stop();
      }, 3000);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Microphone access failed. Check your browser permission and try again.",
      );
    } finally {
      if (alive.current) setInstalling(false);
    }
  }
  return (
    <main className="setup-page">
      <button className="text-button" onClick={onCancel}>
        ← Back to practice
      </button>
      <div className="eyebrow">BEFORE YOU BEGIN</div>
      <h1>
        Make yourself
        <br />
        <em>test ready.</em>
      </h1>
      <p className="lead">
        {plan.label} · {plan.questions.length} questions
      </p>
      <div className="setup-panel">
        <h2>A quiet place. A clear head.</h2>
        <p>
          The timer starts when you begin. You can move forward only, and each
          audio prompt plays once. Keep paper nearby for notes.
        </p>
        {needAudio && (
          <div className="check-row">
            <Volume2 size={22} />
            <div>
              <h3>Check your headphones</h3>
              <audio
                controls
                src={asset(plan.questions.find((q) => q.audio)!.audio!)}
                onError={() =>
                  setError(
                    "Audio could not load. Connect once to download the practice pack, then retry.",
                  )
                }
                aria-label="Headphone check"
              />
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={heard}
                  onChange={(e) => setHeard(e.target.checked)}
                />{" "}
                I can hear the audio clearly
              </label>
            </div>
          </div>
        )}
        {needMic && (
          <div className="check-row">
            <Mic size={22} />
            <div>
              <h3>Check your microphone</h3>
              <p>
                Record three seconds, play it back, and check that you can hear
                yourself. Recordings stay on this device.
              </p>
              <Button
                variant="outline"
                className="secondary"
                disabled={recording || installing}
                onClick={testMic}
              >
                {recording
                  ? "Recording… speak now"
                  : installing
                    ? "Requesting access…"
                    : mic
                      ? "Record another sample"
                      : "Test microphone"}
              </Button>
              {sample && (
                <div>
                  <audio
                    controls
                    src={sample}
                    aria-label="Microphone check playback"
                  />
                </div>
              )}
            </div>
          </div>
        )}
        <div className="notice">
          Independent practice simulation. Layout and timing follow familiar
          computer-based exam conventions; exact live-test parity is unverified.
          Synthetic audio is included. Speaking and extended writing use
          self-review.
        </div>
        {plan.mode === "mock" && (
          <p className="muted">
            This form has 65 questions. Your section limits are 80, 30 and 39
            minutes. Shorter original prompts can make practice faster than test
            day. The unscored personal introduction and test-centre check-in are
            not simulated.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <Button
          className="primary"
          disabled={(needMic && !mic) || (needAudio && !heard) || recording}
          onClick={() => {
            handed.current = true;
            onStart(stream.current);
          }}
        >
          Begin {plan.mode === "mock" ? "mock test" : "practice"}{" "}
          <ArrowRight size={17} />
        </Button>
      </div>
      <p className="muted">
        Use a desktop or laptop for the closest test experience. Leaving or
        refreshing ends this attempt. Completed text responses are saved
        locally; recordings are saved locally when browser storage is available.
      </p>
    </main>
  );
}
type Phase =
  | "countdown"
  | "audio"
  | "blocked"
  | "prepare"
  | "answer"
  | "complete"
  | "error";
export function Runner({
  plan,
  stream,
  onComplete,
}: {
  plan: PracticePlan;
  stream: MediaStream | null;
  onComplete: (result: Result) => void;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const answerRef = useRef(answers);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [confirmNext, setConfirmNext] = useState(false);
  const [transition, setTransition] = useState("");
  const examMain = useRef<HTMLElement>(null);
  const q = plan.questions[index];
  useEffect(() => {
    examMain.current?.focus();
    window.scrollTo(0, 0);
  }, [q.id]);
  const g = guideFor(q);
  const [phase, setPhase] = useState<Phase>("countdown");
  const [phaseSeconds, setPhaseSeconds] = useState(0);
  const [sectionSeconds, setSectionSeconds] = useState(
    plan.minutes[g.section] * 60,
  );
  const [message, setMessage] = useState("");
  const [audioProgress, setAudioProgress] = useState(0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recordDone = useRef<Promise<void> | null>(null);
  const phaseEnd = useRef(0);
  const writingEnd = useRef(0);
  const phaseRef = useRef<Phase>("countdown");
  const sectionEnd = useRef(Date.now() + plan.minutes[g.section] * 60000);
  const previousSection = useRef(g.section);
  const audioContext = useRef<AudioContext | null>(null);
  const nextRef = useRef<
    (end?: boolean, sectionTimeout?: boolean) => Promise<void>
  >(async () => {});
  const cancelled = useRef(false);
  const recordingUrls = useRef(new Set<string>());
  const delivered = useRef(false);
  function patch(a: Answer) {
    const next = {
      ...answerRef.current,
      [q.id]: { ...answerRef.current[q.id], ...a },
    };
    answerRef.current = next;
    setAnswers(next);
  }
  async function stopRecording() {
    const r = recorder.current;
    if (r && r.state === "recording") r.stop();
    await recordDone.current;
  }
  async function advance(end = false, sectionTimeout = false) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    audio.current?.pause();
    await stopRecording();
    let target = index + 1;
    if (sectionTimeout)
      while (
        target < plan.questions.length &&
        guideFor(plan.questions[target]).section === g.section
      )
        target++;
    if (end || target >= plan.questions.length) {
      delivered.current = true;
      stream?.getTracks().forEach((t) => t.stop());
      onComplete({
        id: crypto.randomUUID(),
        label: plan.label,
        date: new Date().toISOString(),
        questionIds: plan.questions.map((x) => x.id),
        answers: answerRef.current,
        finished: !end,
      });
      return;
    }
    if (guideFor(plan.questions[target]).section !== g.section)
      setTransition(
        `Next section: ${sections.find((s) => s.id === guideFor(plan.questions[target]).section)!.title}`,
      );
    setConfirmNext(false);
    setIndex(target);
    busyRef.current = false;
    setBusy(false);
  }
  nextRef.current = advance;
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("beforeunload", leave);
      stream?.getTracks().forEach((t) => t.stop());
      audio.current?.pause();
      void audioContext.current?.close();
      if (!delivered.current)
        recordingUrls.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [stream]);
  useEffect(() => {
    cancelled.current = false;
    let localCancelled = false;
    let monitor: ReturnType<typeof setInterval> | undefined;
    setMessage("");
    setAudioProgress(0);
    writingEnd.current = 0;
    if (previousSection.current !== g.section) {
      sectionEnd.current = Date.now() + plan.minutes[g.section] * 60000;
      previousSection.current = g.section;
    }
    const changePhase = (p: Phase, seconds = 0) => {
      if (localCancelled) return;
      phaseRef.current = p;
      setPhase(p);
      phaseEnd.current = seconds ? Date.now() + seconds * 1000 : 0;
      setPhaseSeconds(seconds);
    };
    const fail = (text: string) => {
      setMessage(text);
      changePhase("error");
    };
    const beginAnswer = () => {
      if (g.kind !== "speak") {
        const seconds = writingEnd.current
          ? Math.max(0, Math.ceil((writingEnd.current - Date.now()) / 1000))
          : g.answerSeconds;
        changePhase("answer", seconds);
        if (writingEnd.current && seconds === 0) void nextRef.current();
        return;
      }
      if (!stream?.active) {
        fail(
          "Microphone disconnected. End this attempt, reconnect your microphone and start again.",
        );
        return;
      }
      try {
        const r = new MediaRecorder(stream);
        recorder.current = r;
        const chunks: Blob[] = [];
        recordDone.current = new Promise<void>((resolve) => {
          r.ondataavailable = (e) => {
            if (e.data.size) chunks.push(e.data);
          };
          r.onstop = () => {
            const blob = new Blob(chunks, { type: r.mimeType });
            if (blob.size) {
              const url = URL.createObjectURL(blob);
              recordingUrls.current.add(url);
              const next = {
                ...answerRef.current,
                [q.id]: { ...answerRef.current[q.id], recording: url },
              };
              answerRef.current = next;
              if (!localCancelled) setAnswers(next);
            }
            resolve();
          };
          r.onerror = () => {
            fail(
              "Recording failed. End this attempt and check your microphone.",
            );
            resolve();
          };
        });
        r.start();
        const seconds = writingEnd.current
          ? Math.max(0, Math.ceil((writingEnd.current - Date.now()) / 1000))
          : g.answerSeconds;
        changePhase("answer", seconds);
        if (writingEnd.current && seconds === 0) void nextRef.current();
        const context = audioContext.current || new AudioContext();
        audioContext.current = context;
        void context.resume();
        if (q.type !== "answer-short-question") {
          const tone = context.createOscillator();
          const gain = context.createGain();
          gain.gain.value = 0.08;
          tone.frequency.value = 880;
          tone.connect(gain);
          gain.connect(context.destination);
          tone.start();
          tone.stop(context.currentTime + 0.15);
        }
        // Local RMS approximation of the first five speaking tasks' silence cutoff.
        if (
          [
            "read-aloud",
            "repeat-sentence",
            "describe-image",
            "retell-lecture",
            "answer-short-question",
          ].includes(q.type)
        ) {
          const source = context.createMediaStreamSource(stream),
            analyser = context.createAnalyser();
          analyser.fftSize = 1024;
          source.connect(analyser);
          const samples = new Float32Array(analyser.fftSize);
          let lastVoice = Date.now();
          monitor = setInterval(() => {
            if (r.state !== "recording") return;
            analyser.getFloatTimeDomainData(samples);
            const rms = Math.sqrt(
              samples.reduce((n, x) => n + x * x, 0) / samples.length,
            );
            if (rms > 0.012) lastVoice = Date.now();
            if (Date.now() - lastVoice >= 3000) {
              r.stop();
              changePhase("complete");
            }
          }, 100);
        }
      } catch {
        fail(
          "This browser could not start recording. End the attempt and try a modern desktop browser.",
        );
      }
    };
    const prepare = () =>
      g.prepSeconds ? changePhase("prepare", g.prepSeconds) : beginAnswer();
    const el = audio.current;
    if (q.audio && el) {
      el.onplay = () => {
        if (q.type === "summarize-spoken-text" && !writingEnd.current)
          writingEnd.current = Date.now() + g.answerSeconds * 1000;
      };
      el.onended = () => {
        setAudioProgress(100);
        prepare();
      };
      el.onerror = () =>
        fail(
          "The audio could not load. End this attempt and reconnect to download the practice pack.",
        );
      el.ontimeupdate = () =>
        setAudioProgress(
          el.duration ? (el.currentTime / el.duration) * 100 : 0,
        );
      changePhase("countdown", 3);
    } else prepare();
    const interval = setInterval(() => {
      const sectionLeft = Math.max(
        0,
        Math.ceil((sectionEnd.current - Date.now()) / 1000),
      );
      setSectionSeconds(sectionLeft);
      if (sectionLeft === 0) {
        void nextRef.current(false, true);
        return;
      }
      if (
        writingEnd.current &&
        ["audio", "answer"].includes(phaseRef.current)
      ) {
        const left = Math.max(
          0,
          Math.ceil((writingEnd.current - Date.now()) / 1000),
        );
        setPhaseSeconds(left);
        if (left === 0) {
          void nextRef.current();
          return;
        }
      }
      if (!phaseEnd.current) return;
      const remaining = Math.max(
        0,
        Math.ceil((phaseEnd.current - Date.now()) / 1000),
      );
      setPhaseSeconds(remaining);
      if (remaining > 0) return;
      const current = phaseRef.current;
      phaseEnd.current = 0;
      if (current === "countdown" && el) {
        changePhase("audio");
        void el.play().catch(() => {
          changePhase("blocked");
          setMessage(
            "Your browser paused automatic audio. Select Start audio to continue; it will play once.",
          );
        });
      } else if (current === "prepare") beginAnswer();
      else if (current === "answer") {
        if (g.kind === "speak") {
          if (recorder.current?.state === "recording") recorder.current.stop();
          changePhase("complete");
        } else void nextRef.current();
      }
    }, 200);
    return () => {
      localCancelled = true;
      cancelled.current = true;
      clearInterval(interval);
      if (monitor) clearInterval(monitor);
      if (el) {
        el.pause();
        el.onended = null;
        el.onplay = null;
        el.onerror = null;
        el.ontimeupdate = null;
      }
    };
    // A question owns exactly one audio/recording lifecycle.
  }, [q.id]);
  const answer = answers[q.id] || {};
  const canNext = ["answer", "complete", "error"].includes(phase);
  const isSpeak = g.kind === "speak";
  const locked = isSpeak || ["countdown", "blocked", "error"].includes(phase);
  const status =
    phase === "countdown"
      ? `Beginning in ${phaseSeconds} seconds`
      : phase === "audio"
        ? "Playing"
        : phase === "prepare"
          ? `Beginning in ${phaseSeconds} seconds`
          : phase === "answer"
            ? isSpeak
              ? "Recording"
              : "In progress"
            : phase === "complete"
              ? "Completed"
              : phase === "blocked"
                ? "Audio paused"
                : "Unavailable";
  const hasAnswer = Boolean(
    answer.recording || answer.text?.trim() || answer.values?.some(Boolean),
  );
  return (
    <div className="exam">
      <header className="exam-header">
        <span>PTE Academic · Practice</span>
        <div>
          <span>{sections.find((s) => s.id === g.section)!.title}</span>
          <span className="exam-clock">
            <Clock3 size={17} /> Time Remaining {formatTime(sectionSeconds)}
          </span>
        </div>
      </header>
      <div className="exam-subheader">
        <span>{g.title}</span>
        <span>
          {index + 1} of {plan.questions.length}
        </span>
      </div>
      <main className="exam-main" key={q.id} ref={examMain} tabIndex={-1}>
        <p className="exam-instructions">{g.instructions}</p>
        {transition && (
          <p className="sr-only" role="status">
            {transition}
          </p>
        )}
        {q.text &&
          !["bank", "dropdown", "blanks", "highlight"].includes(g.kind) && (
            <div className="stimulus">{q.text}</div>
          )}
        {(q.audio || isSpeak) && (
          <div className="recording-panel">
            <strong>
              {phase === "audio" || phase === "countdown" || phase === "blocked"
                ? "Audio"
                : isSpeak
                  ? "Recorded Answer"
                  : "Audio"}
            </strong>
            <p role="status">
              Current Status: <b>{status}</b>
            </p>
            <div
              className="exam-progress"
              role="progressbar"
              aria-label="Question progress"
              aria-valuenow={Math.round(
                phase === "audio"
                  ? audioProgress
                  : phase === "complete"
                    ? 100
                    : phase === "answer" && g.answerSeconds
                      ? (1 - phaseSeconds / g.answerSeconds) * 100
                      : 0,
              )}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span
                style={{
                  width: `${phase === "audio" ? audioProgress : phase === "complete" ? 100 : phase === "answer" && g.answerSeconds ? (1 - phaseSeconds / g.answerSeconds) * 100 : 0}%`,
                }}
              />
            </div>
            {isSpeak && phase === "answer" && (
              <small>Speak now · {formatTime(phaseSeconds)}</small>
            )}
            {phase === "blocked" && (
              <button
                onClick={() => {
                  setMessage("");
                  void audio.current
                    ?.play()
                    .then(() => {
                      phaseRef.current = "audio";
                      setPhase("audio");
                    })
                    .catch(() =>
                      setMessage(
                        "Audio is still blocked. Check browser audio settings and try again.",
                      ),
                    );
                }}
              >
                Start audio
              </button>
            )}
          </div>
        )}
        {!isSpeak && g.answerSeconds > 0 && (
          <div className="item-clock">
            Item time remaining: {formatTime(phaseSeconds)}
          </div>
        )}
        {q.audio && <audio ref={audio} src={asset(q.audio)} preload="auto" />}
        {message && (
          <p className={phase === "error" ? "error" : "notice"} role="alert">
            {message}
          </p>
        )}
        <QuestionInput
          q={q}
          answer={answer}
          onChange={patch}
          disabled={locked || busy}
        />
      </main>
      <footer className="exam-footer">
        <button className="exam-exit" onClick={() => setConfirmExit(true)}>
          <LogOut size={15} /> End practice
        </button>
        <button
          className="exam-next"
          disabled={!canNext || busy}
          onClick={() => (hasAnswer ? void advance() : setConfirmNext(true))}
        >
          {busy ? "Saving…" : "Next"} <ArrowRight size={16} />
        </button>
      </footer>
      <Dialog
        open={confirmExit || confirmNext}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmExit(false);
            setConfirmNext(false);
          }
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogTitle>
            {confirmExit ? "End this attempt?" : "Move to the next question?"}
          </DialogTitle>
          <DialogDescription>
            {confirmExit
              ? "Your completed responses will be available for review. Remaining questions will be marked unanswered."
              : "You have not entered a response. You cannot return to this question."}
          </DialogDescription>
          <div className="flex justify-end gap-3 pt-3">
            <Button
              variant="outline"
              onClick={() => {
                setConfirmExit(false);
                setConfirmNext(false);
              }}
            >
              Keep practising
            </Button>
            <Button onClick={() => void advance(confirmExit)}>
              {confirmExit ? "End & review" : "Continue"}
              <Check size={16} />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
