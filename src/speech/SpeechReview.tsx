import { SyllableScores } from "./SyllableScores";
import { AudioPlayer } from "../components/AudioPlayer";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AudioLines, Gauge, X, CircleHelp, ListChecks } from "lucide-react";
import type { Answer, Question } from "../content";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { ReadingPages } from "../Pages";
import { savePronunciation } from "../storage";
import { scoreRecording } from "./comparison-client";
import { modelStatus, subscribeModel } from "./comparison-assets";
import { pronunciationSummary, type Pronunciation } from "./comparison-schema";
import { toast } from "sonner";
export function SpeechReview({
  question,
  answer,
  attemptId,
  questionNumber,
  onPronunciation,
}: {
  question: Question;
  answer: Answer;
  attemptId: string;
  questionNumber: number;
  onPronunciation: (value: Pronunciation) => void;
}) {
  const [panel, setPanel] = useState(
    answer.pronunciation
      ? "syllables"
      : answer.transcription
        ? "transcript"
        : "idle",
  );
  const [pronunciation, setPronunciation] = useState(answer.pronunciation);
  const model = useSyncExternalStore(subscribeModel, modelStatus);
  const expected =
    question.type === "read-aloud"
      ? question.text
      : question.type === "repeat-sentence"
        ? question.audioText
        : undefined;
  const scoreJob = useRef<ReturnType<typeof scoreRecording> | null>(null);
  const transcription = answer.transcription;
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      scoreJob.current?.cancel();
    };
  }, []);
  function cancel() {
    scoreJob.current?.cancel();
    // Keep the action disabled until audio decoding/worker cleanup has settled.
    setProgress("Cancelling…");
  }
  async function score() {
    if (!answer.recording || !expected || scoreJob.current) return;
    setError("");
    const operation = scoreRecording(answer.recording, expected, (message) => {
      if (alive.current) setProgress(message);
    });
    scoreJob.current = operation;
    try {
      const value = await operation.promise;
      if (!alive.current || scoreJob.current !== operation) return;
      setPronunciation(value);
      setPanel("syllables");
      try {
        const saved = await savePronunciation(attemptId, question.id, value);
        if (!alive.current || scoreJob.current !== operation) return;
        onPronunciation(value);
        if (saved) toast.success("Syllable scores saved on this device");
        else
          setError(
            "This attempt is no longer stored. Scores are available in this view.",
          );
      } catch {
        if (alive.current)
          setError(
            "Scores ready, but they could not be saved. They are available in this view.",
          );
      }
    } catch (e) {
      if (
        alive.current &&
        !(e instanceof DOMException && e.name === "AbortError")
      )
        setError(
          e instanceof Error
            ? e.message
            : "Speech comparison failed. Your recording is retained.",
        );
    } finally {
      if (alive.current && scoreJob.current === operation) {
        scoreJob.current = null;
        setProgress("");
      }
    }
  }
  const similarity = pronunciation ? pronunciationSummary(pronunciation) : null;
  return (
    <section
      aria-label="On-device speech feedback"
      className="local-speech-screen"
    >
      <div className="speech-toolbar">
        <div className="speech-actions flex flex-wrap items-center gap-2">
          {expected && answer.recording && (
            <Button
              onClick={() => void score()}
              disabled={!!progress || model.status !== "ready"}
              title="Score speech with v3 model"
              aria-label="Score speech with v3 model"
            >
              <Gauge className="size-4" />
              <span className="speech-action-label">
                {pronunciation ? "Score again" : "Score speech"}
              </span>
            </Button>
          )}
          {!!progress && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Cancel speech scoring"
              onClick={cancel}
            >
              <X className="size-4" />
            </Button>
          )}

          {!!progress && (
            <p role="status" className="text-xs text-muted-foreground">
              {progress}
            </p>
          )}
        </div>
        <div className="speech-tabs">
          {pronunciation && (
            <Button
              aria-label="Syllable scores"
              aria-pressed={panel === "syllables"}
              title="Syllable scores"
              variant={panel === "syllables" ? "secondary" : "ghost"}
              onClick={() => setPanel("syllables")}
            >
              <ListChecks />
              <span>Syllables</span>
            </Button>
          )}
          {transcription && (
            <Button
              aria-label="Transcript"
              aria-pressed={panel === "transcript"}
              title="Transcript"
              variant={panel === "transcript" ? "secondary" : "ghost"}
              onClick={() => setPanel("transcript")}
            >
              <AudioLines />
              <span>Saved transcript</span>
            </Button>
          )}
          <Dialog>
            <DialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="How local feedback works"
                  title="How local feedback works"
                />
              }
            >
              <CircleHelp />
            </DialogTrigger>
            <DialogContent className="practice-ui info-dialog">
              <DialogTitle>How local feedback works</DialogTitle>
              <ReadingPages
                label="speech help pages"
                texts={[
                  ...(expected
                    ? [
                        "Read Aloud and Repeat Sentence use the trained blended-English v3 model for syllable sound similarity. American, British, Australian and Indian references are equally valid. Uncertain syllables have no score. This is experimental synthetic-reference similarity, not pronunciation correctness, fluency, proficiency or an exam score. Stress assessment remains separate from this app score.",
                        "The required comparison model downloads automatically, is verified and cached for offline scoring. Your recording stays on this device.",
                      ]
                    : []),
                  "Replay your recording for self-review. Other speaking tasks do not have automatic grading. Previously saved transcripts remain readable, but this app no longer generates transcripts or word-match feedback. Your recording stays on this device.",
                ]}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>
      {answer.recording && (
        <AudioPlayer
          src={answer.recording}
          label={`Your recording for question ${questionNumber}`}
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {panel === "syllables" && pronunciation ? (
        <div className="speech-reading" aria-label="Local syllable scores">
          <p className="speech-stats">
            {similarity !== null && (
              <Badge
                variant="secondary"
                aria-label={`Reference similarity ${similarity} out of 100`}
              >
                {similarity}/100 similarity
              </Badge>
            )}{" "}
            {
              pronunciation.syllables.filter((s) => s.status === "scored")
                .length
            }{" "}
            of {pronunciation.syllables.length} syllables scored
          </p>
          {pronunciation.syllables.length ? (
            <SyllableScores syllables={pronunciation.syllables} />
          ) : (
            <p>
              {pronunciation.status === "no-reliable-speech"
                ? "No reliable speech detected. No syllable score."
                : "No supported syllables could be scored."}
            </p>
          )}
        </div>
      ) : transcription ? (
        <div className="speech-reading" aria-label="Local transcript result">
          <ReadingPages
            key={transcription.text}
            label="transcript pages"
            texts={[
              transcription.text ||
                "The saved transcript is empty. Replay your recording for self-review.",
            ]}
          />
        </div>
      ) : (
        <div className="speech-idle">
          <AudioLines />
          <p>
            {!answer.recording
              ? "No recording was saved for this response. Record a response in a new practice to get speech feedback."
              : expected
                ? "Listen back, then score your speech when the model is ready."
                : "Listen back and compare your response with the example for self-review."}
          </p>
        </div>
      )}
    </section>
  );
}
