import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { asset, type Answer, type Question } from "../content";
import { exampleLabel, promptBlocks } from "../review-content";
import { AudioPlayer } from "../components/AudioPlayer";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { ReadingPages } from "../Pages";
import { Chart } from "../QuestionInput";
import { savePronunciation } from "../storage";
import { scoreRecording } from "./comparison-client";
import { modelStatus, subscribeModel } from "./comparison-assets";
import { pronunciationSummary, type Pronunciation } from "./comparison-schema";
import { SpeechDiff, feedbackWords, type FeedbackWord } from "./SpeechDiff";
const SyllablePractice = lazy(() =>
  import("./SyllablePractice").then((module) => ({
    default: module.SyllablePractice,
  })),
);
export function SpeechReview({
  question,
  answer,
  attemptId,
  onPronunciation,
}: {
  question: Question;
  answer: Answer;
  attemptId: string;
  onPronunciation: (value: Pronunciation) => void;
}) {
  const [pronunciation, setPronunciation] = useState(answer.pronunciation);
  const [selected, setSelected] = useState<FeedbackWord>();
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const model = useSyncExternalStore(subscribeModel, modelStatus);
  const expected =
    question.type === "read-aloud"
      ? question.text
      : question.type === "repeat-sentence"
        ? question.audioText
        : undefined;
  const referenceAudio = expected
    ? question.audio || `audio/${question.id}-reference.mp3`
    : undefined;
  const scoreJob = useRef<ReturnType<typeof scoreRecording> | null>(null);
  const tried = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      scoreJob.current?.cancel();
    };
  }, []);
  async function score() {
    if (!answer.recording || !expected || scoreJob.current || pronunciation)
      return;
    tried.current = true;
    setError("");
    const operation = scoreRecording(answer.recording, expected, (message) => {
      if (alive.current) setProgress(message);
    });
    scoreJob.current = operation;
    try {
      const value = await operation.promise;
      if (!alive.current) return;
      setPronunciation(value);
      try {
        const saved = await savePronunciation(attemptId, question.id, value);
        if (!alive.current) return;
        onPronunciation(value);
        if (saved) toast.success("Syllable feedback saved on this device");
        else
          setError(
            "This session is no longer stored. Feedback is available in this view.",
          );
      } catch {
        if (alive.current)
          setError(
            "Feedback is ready, but could not be saved. It is available in this view.",
          );
      }
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof DOMException && e.name === "AbortError"
            ? "Feedback cancelled. Your recording is retained."
            : e instanceof Error
              ? e.message
              : "Speech feedback could not finish.",
        );
    } finally {
      scoreJob.current = null;
      if (alive.current) setProgress("");
    }
  }
  useEffect(() => {
    if (
      expected &&
      answer.recording &&
      !pronunciation &&
      !tried.current &&
      model.status === "ready"
    )
      void score();
  }, [expected, answer.recording, pronunciation, model.status]);
  const words = useMemo(
    () => feedbackWords(expected || "", pronunciation),
    [expected, pronunciation],
  );
  const similarity = pronunciation ? pronunciationSummary(pronunciation) : null;
  return (
    <section
      aria-label="On-device speech feedback"
      className="local-speech-screen"
    >
      <div className="review-audio-pair">
        {answer.recording && (
          <AudioPlayer src={answer.recording} label="Your recording" />
        )}
        {(referenceAudio || question.audio) && (
          <AudioPlayer
            src={asset(referenceAudio || question.audio!)}
            label={referenceAudio ? "Reference recording" : "Prompt recording"}
          />
        )}
      </div>
      {progress && (
        <div className="speech-toolbar">
          <span role="status">{progress}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cancel speech scoring"
            onClick={() => scoreJob.current?.cancel()}
          >
            <X />
          </Button>
        </div>
      )}
      {error && (
        <p role="alert">
          {error}{" "}
          {!pronunciation && !progress && (
            <Button
              variant="outline"
              size="sm"
              disabled={model.status !== "ready"}
              onClick={() => void score()}
            >
              Retry feedback
            </Button>
          )}
        </p>
      )}
      {expected ? (
        <>
          <div className="speech-summary" aria-label="Local syllable scores">
            {similarity !== null && (
              <Badge
                variant="secondary"
                aria-label={`Reference similarity ${similarity} out of 100`}
              >
                {similarity}/100 similarity
              </Badge>
            )}
            {pronunciation && (
              <span>
                {
                  pronunciation.syllables.filter((s) => s.status === "scored")
                    .length
                }{" "}
                of {pronunciation.syllables.length} syllables scored
              </span>
            )}
            {pronunciation?.status === "no-reliable-speech" && (
              <span>
                No reliable speech detected. Select a word to practise.
              </span>
            )}
          </div>
          <p className="speech-stats">
            Select a word to listen and practise its syllables. Scores compare
            your audio with the prompt sounds; they do not transcribe what you
            said.
          </p>
          <SpeechDiff words={words} onSelect={setSelected} />
          {!answer.recording && (
            <p>No recording was saved. You can still practise each syllable.</p>
          )}
          {answer.transcription && (
            <details>
              <summary>Saved transcript</summary>
              <p>
                {answer.transcription.text || "The saved transcript is empty."}
              </p>
            </details>
          )}
          <p className="speech-stats">
            Reference similarity, not pronunciation correctness or an exam
            score. Uncertain syllables have no score.
          </p>
          {selected && referenceAudio && (
            <Suspense
              fallback={<p role="status">Opening syllable practice…</p>}
            >
              <SyllablePractice
                key={selected.index}
                word={selected}
                questionId={question.id}
                expected={expected}
                recording={answer.recording}
                attemptId={attemptId}
                ready={model.status === "ready" && !progress}
                onClose={() => setSelected(undefined)}
              />
            </Suspense>
          )}
        </>
      ) : (
        <div className="speech-reading">
          {question.chart && (
            <div className="review-chart">
              <Chart q={question} responsive />
            </div>
          )}
          <ReadingPages
            label="feedback pages"
            blocks={[
              ...(!answer.recording
                ? [{ text: "No recording was saved." }]
                : []),
              { label: "What to check", text: question.explanation },
              ...(question.model
                ? [{ label: exampleLabel(question), text: question.model }]
                : []),
              ...promptBlocks(question),
              ...(answer.transcription
                ? [
                    {
                      label: "Saved transcript",
                      text:
                        answer.transcription.text ||
                        "The saved transcript is empty.",
                    },
                  ]
                : []),
              { text: "This response is not automatically graded." },
            ]}
          />
        </div>
      )}
    </section>
  );
}
