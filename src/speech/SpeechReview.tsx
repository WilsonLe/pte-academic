import { SyllableScores } from "./SyllableScores";
import { AudioPlayer } from "../components/AudioPlayer";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AudioLines,
  Gauge,
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
import { saveTranscription, savePronunciation } from "../storage";
import { scoreRecording } from "./comparison-client";
import { modelStatus, subscribeModel } from "./comparison-assets";
import { pronunciationSummary, type Pronunciation } from "./comparison-schema";
import { toast } from "sonner";
export function SpeechReview({
  question,
  answer,
  attemptId,
  questionNumber,
  onChange,
  onPronunciation,
}: {
  question: Question;
  answer: Answer;
  attemptId: string;
  questionNumber: number;
  onChange: (value: Transcription) => void;
  onPronunciation: (value: Pronunciation) => void;
}) {
  const [panel, setPanel] = useState(
    answer.pronunciation ? "syllables" : "transcript",
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
      scoreJob.current?.cancel();
    };
  }, []);
  function cancel() {
    job.current?.cancel();
    scoreJob.current?.cancel();
    // Keep the action disabled until audio decoding/worker cleanup has settled.
    setProgress("Cancelling…");
  }
  async function score() {
    if (!answer.recording || !expected || job.current || scoreJob.current)
      return;
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
  async function run() {
    if (!answer.recording || job.current || scoreJob.current) return;
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
  const similarity = pronunciation ? pronunciationSummary(pronunciation) : null;
  return (
    <section
      aria-label="On-device speech feedback"
      className="local-speech-screen"
    >
      <div className="speech-toolbar">
        <div className="speech-actions flex flex-wrap items-center gap-2">
          {expected && (
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
          <Button
            variant="outline"
            onClick={() => void run()}
            disabled={!!progress}
            title={transcription ? "Transcribe again" : "Transcribe"}
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
            <span className="speech-action-label">
              {transcription ? "Transcribe again" : "Transcribe"}
            </span>
          </Button>
          {!!progress && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={
                scoreJob.current
                  ? "Cancel speech scoring"
                  : "Cancel transcription"
              }
              onClick={cancel}
            >
              <X className="size-4" />
            </Button>
          )}

          {f?.comparison && (
            <Badge
              className="speech-word-badge"
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
        <div className="speech-tabs">
          {pronunciation && (
            <Button
              aria-label="Syllable scores"
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
              variant={panel === "transcript" ? "secondary" : "ghost"}
              onClick={() => setPanel("transcript")}
            >
              <AudioLines />
              <span>Transcript</span>
            </Button>
          )}
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
      </div>
      <AudioPlayer
        src={answer.recording!}
        label={`Your recording for question ${questionNumber}`}
      />
      {!transcription && !pronunciation && !progress && (
        <p className="mt-2 text-xs text-muted-foreground">
          Transcription downloads ~60 MB on first use.
        </p>
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
      ) : panel === "help" ? (
        <ReadingPages
          label="speech help pages"
          texts={[
            ...(expected
              ? [
                  "Read Aloud and Repeat Sentence use the trained blended-English v3 model for syllable sound similarity. American, British, Australian and Indian references are equally valid. Uncertain syllables have no score. This is experimental synthetic-reference similarity, not pronunciation correctness, fluency, proficiency or an exam score. Stress assessment remains separate from this app score.",
                  "The required comparison model downloads automatically, is verified and cached for offline scoring. Your recording stays on this device. The browser export uses float16-stored encoder weights with float32 operations and the unchanged v3 comparison head, bank and calibration. Accepted checkpoint SHA-256: 2a8e9680e71c85d98f2adc8da725c56f21bd866340cf545916fdf5dff7389d1b.",
                ]
              : []),
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
              {expected && f.comparison
                ? `${f.comparison.accuracy}% word match · ${Math.round(transcription.seconds)}s recording`
                : `${f.words} recognized words · ${Math.round(transcription.seconds)}s recording · ${f.wordsPerMinute} words/min`}
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
