import { useEffect, useRef, useState } from "react";
import { AudioLines, LoaderCircle, X, Info, RotateCw } from "lucide-react";
import type { Answer, Question } from "../content";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "../components/ui/collapsible";
import { transcribeRecording } from "./client";
import { speechFeedback, type Transcription } from "./scoring";
import { saveTranscription } from "../storage";
import { toast } from "sonner";
export function SpeechReview({
  question,
  answer,
  attemptId,
  onChange,
}: {
  question: Question;
  answer: Answer;
  attemptId: string;
  onChange: (value: Transcription) => void;
}) {
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
      className="mt-5 border-t pt-4"
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
      {!transcription && !progress && (
        <p className="mt-2 text-xs text-muted-foreground">
          First use downloads ~60 MB. Audio stays on this device.
        </p>
      )}
      <Collapsible className="more mt-1">
        <CollapsibleTrigger className="flex min-h-10 items-center gap-2 text-xs text-muted-foreground">
          <Info className="size-3.5" />
          How local feedback works
        </CollapsibleTrigger>
        <CollapsibleContent className="disclosure-panel">
          <div className="space-y-2 pb-3 text-xs leading-6 text-muted-foreground">
            <p>
              First use downloads about 60 MB of speech files, then caches them
              for offline use. Your recording stays on this device. Transcribe
              only when you are ready to download; slower devices may take
              longer.
            </p>
            <p>
              Word match compares recognized words with the reference, counting
              missing, changed and extra words. Short answers ignore case,
              punctuation and a leading article. Other speaking tasks show a
              transcript and pace for self-review.
            </p>
            <p>
              The recognizer can mishear words or invent speech from noise.
              Empty or silent responses get no score. This does not assess
              pronunciation, accent, fluency or English proficiency, and is not
              a PTE score. Pace includes pauses and has no pass/fail target.
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>
      {error && (
        <p role="alert" className="my-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {transcription && (
        <div className="mt-2 space-y-3" aria-label="Local transcript result">
          <p className="whitespace-pre-wrap text-sm leading-7">
            {transcription.text ||
              "No speech recognized. Replay your recording and try again."}
          </p>
          {f && f.words > 0 && (
            <p className="text-xs text-muted-foreground">
              {f.words} recognized words · {Math.round(transcription.seconds)}s
              recording · {f.wordsPerMinute} words/min
            </p>
          )}
          {f?.comparison && (
            <Collapsible className="more">
              <CollapsibleTrigger className="min-h-10 text-xs text-muted-foreground">
                Word comparison · {f.comparison.errors} word errors
              </CollapsibleTrigger>
              <CollapsibleContent className="disclosure-panel">
                <ol
                  className="flex flex-wrap gap-x-2 gap-y-1 pb-3 text-xs leading-7"
                  aria-label="Compared words"
                >
                  {f.comparison.alignment.map((word, index) => (
                    <li
                      key={index}
                      className={
                        word.kind === "match"
                          ? "text-muted-foreground"
                          : "rounded bg-muted px-1 font-medium"
                      }
                    >
                      {word.kind === "match"
                        ? word.heard
                        : word.kind === "missing"
                          ? `Missing: ${word.expected}`
                          : word.kind === "extra"
                            ? `Extra: ${word.heard}`
                            : `${word.heard} → ${word.expected}`}
                    </li>
                  ))}
                </ol>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}
    </section>
  );
}
