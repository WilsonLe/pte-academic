import { AudioPlayer } from "../components/AudioPlayer";
import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  LoaderCircle,
  X,
  Info,
  RotateCw,
  ListChecks,
} from "lucide-react";
import type { Answer, Question } from "../content";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { ReadingPages } from "../Pages";
import { transcribeRecording } from "./client";
import { speechFeedback, type Transcription } from "./scoring";
import { saveTranscription } from "../storage";
import { toast } from "sonner";
export function SpeechReview({
  question,
  answer,
  attemptId,
  questionNumber,
  onChange,
}: {
  question: Question;
  answer: Answer;
  attemptId: string;
  questionNumber: number;
  onChange: (value: Transcription) => void;
}) {
  const [panel, setPanel] = useState("transcript");
  const [transcription, setTranscription] = useState(answer.transcription);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const job = useRef<ReturnType<typeof transcribeRecording> | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      job.current?.cancel();
    };
  }, []);
  function cancel() {
    job.current?.cancel();
    // Keep the action disabled until audio decoding/worker cleanup has settled.
    setProgress("Cancelling…");
  }
  async function run() {
    if (!answer.recording || job.current) return;
    setError("");
    const operation = transcribeRecording(answer.recording, (message) => {
      if (alive.current) setProgress(message);
    });
    job.current = operation;
    try {
      const value = await operation.promise;
      if (!alive.current || job.current !== operation) return;
      setTranscription(value);
      setPanel("transcript");
      try {
        const saved = await saveTranscription(attemptId, question.id, value);
        if (!alive.current || job.current !== operation) return;
        onChange(value);
        if (saved) toast.success("Transcript saved on this device");
        else
          setError(
            "This attempt is no longer stored. The transcript is available in this view.",
          );
      } catch {
        if (alive.current)
          setError(
            "Transcript ready, but it could not be saved. It is available in this view.",
          );
      }
    } catch (e) {
      if (
        alive.current &&
        job.current === operation &&
        !(e instanceof DOMException && e.name === "AbortError")
      )
        setError(
          e instanceof Error
            ? e.message
            : "Transcription failed. Replay your recording or retry.",
        );
    } finally {
      if (alive.current && job.current === operation) {
        job.current = null;
        setProgress("");
      }
    }
  }
  const f = transcription ? speechFeedback(question, transcription) : null;
  return (
    <section
      aria-label="On-device speech feedback"
      className="local-speech-screen"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          onClick={() => void run()}
          disabled={!!progress}
          aria-label={
            transcription
              ? "Transcribe again on this device"
              : "Transcribe on this device"
          }
        >
          {progress ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : transcription ? (
            <RotateCw className="size-4" />
          ) : (
            <AudioLines className="size-4" />
          )}
          {transcription ? "Transcribe again" : "Transcribe"}
        </Button>
        {!!progress && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cancel transcription"
            onClick={cancel}
          >
            <X className="size-4" />
          </Button>
        )}
        {f?.comparison && (
          <Badge
            variant="secondary"
            aria-label={`Word match ${f.comparison.accuracy} percent`}
          >
            {f.comparison.accuracy}% word match
          </Badge>
        )}
        {f?.answerMatch !== null && f?.answerMatch !== undefined && (
          <Badge variant="secondary">
            {f.answerMatch ? "Matches answer key" : "Compare answer key"}
          </Badge>
        )}
        {!!progress && (
          <p role="status" className="text-xs text-muted-foreground">
            {progress}
          </p>
        )}
      </div>
      <AudioPlayer
        src={answer.recording!}
        label={`Your recording for question ${questionNumber}`}
      />
      {!transcription && !progress && (
        <p className="mt-2 text-xs text-muted-foreground">
          First use downloads ~60 MB. Audio stays on this device.
        </p>
      )}
      <div className="speech-tabs">
        <Button
          aria-label="How local feedback works"
          variant={panel === "help" ? "secondary" : "ghost"}
          onClick={() => setPanel(panel === "help" ? "transcript" : "help")}
        >
          <Info />
          <span>How local feedback works</span>
        </Button>
        {f?.comparison && (
          <Button
            aria-label={`Word comparison · ${f.comparison.errors} word errors`}
            variant={panel === "comparison" ? "secondary" : "ghost"}
            onClick={() =>
              setPanel(panel === "comparison" ? "transcript" : "comparison")
            }
          >
            <ListChecks />
            <span>Word comparison · {f.comparison.errors} word errors</span>
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {panel === "help" ? (
        <ReadingPages
          label="speech help pages"
          texts={[
            "First use downloads about 60 MB of speech files, then caches them for offline use. Your recording stays on this device. Transcribe only when you are ready to download; slower devices may take longer.",
            "Word match compares recognized words with the reference, counting missing, changed and extra words. Short answers ignore case, punctuation and a leading article. Other speaking tasks show a transcript and pace for self-review.",
            "The recognizer can mishear words or invent speech from noise. Empty or silent responses get no score. This does not assess pronunciation, accent, fluency or English proficiency, and is not a PTE score. Pace includes pauses and has no pass/fail target.",
          ]}
        />
      ) : panel === "comparison" && f?.comparison ? (
        <div className="speech-reading" aria-label="Compared words">
          <ReadingPages
            label="word comparison pages"
            texts={[
              f.comparison.alignment
                .map((word) =>
                  word.kind === "match"
                    ? word.heard
                    : word.kind === "missing"
                      ? `Missing: ${word.expected}`
                      : word.kind === "extra"
                        ? `Extra: ${word.heard}`
                        : `${word.heard} → ${word.expected}`,
                )
                .join(" · "),
            ]}
          />
        </div>
      ) : transcription ? (
        <div className="speech-reading" aria-label="Local transcript result">
          {f && f.words > 0 && (
            <p className="speech-stats">
              {f.words} recognized words · {Math.round(transcription.seconds)}s
              recording · {f.wordsPerMinute} words/min
            </p>
          )}
          <ReadingPages
            key={transcription.text}
            label="transcript pages"
            texts={[
              transcription.text ||
                "No speech recognized. Replay your recording and try again.",
            ]}
          />
        </div>
      ) : (
        <div className="speech-idle">
          <AudioLines />
          <p>Listen back, then transcribe when you’re ready.</p>
        </div>
      )}
    </section>
  );
}
