import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Mic, Square, X } from "lucide-react";
import { toast } from "sonner";
import { asset } from "../content";
import { AudioPlayer, stopReviewAudio } from "../components/AudioPlayer";
import { Button } from "../components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { reviewRewardMutation } from "../queries";
import references from "./reference-clips.json";
import { scoreRecording } from "./comparison-client";
import { type Pronunciation } from "./comparison-schema";
import type { FeedbackWord } from "./SpeechDiff";
import { loadWordReference, type ReferenceSyllable } from "./word-reference";
import {
  ModelAssetError,
  invalidateComparisonModel,
  modelStatus,
} from "./comparison-assets";
import { similarityTone } from "./syllable-display";
import { scriptKey } from "./comparison-core";

const referenceAccentNames: Record<string, string> = {
  "en-US": "American English",
  "en-GB": "British English",
  "en-AU": "Australian English",
  "en-IN": "Indian English",
  en: "English (accent unverified)",
};
export function SyllablePractice({
  word,
  questionId,
  expected,
  recording,
  attemptId,
  ready,
  onClose,
}: {
  word: FeedbackWord;
  questionId: string;
  expected: string;
  recording?: string;
  attemptId: string;
  ready: boolean;
  onClose: () => void;
}) {
  const [corpusReference, setCorpusReference] =
    useState<Awaited<ReturnType<typeof loadWordReference>>>();
  const [referenceError, setReferenceError] = useState("");
  const referenceLabels = word.syllables.map((s) => s.label).join("|");
  const [referenceRequest, setReferenceRequest] = useState(0);
  const previousReady = useRef(ready);
  useEffect(() => {
    if (ready && !previousReady.current && referenceError)
      setReferenceRequest((request) => request + 1);
    previousReady.current = ready;
  }, [ready, referenceError]);
  useEffect(() => {
    if (!word.spoken) return;
    setCorpusReference(undefined);
    setReferenceError("");
    let live = true,
      url = "";
    loadWordReference(
      word.spoken.word,
      referenceLabels ? referenceLabels.split("|") : [],
    )
      .then((value) => {
        if (!value) {
          if (live)
            setReferenceError(
              "No reference recording is available for this word yet.",
            );
          return;
        }
        url = value.audio;
        if (live) setCorpusReference(value);
        else URL.revokeObjectURL(url);
      })
      .catch((error) => {
        if (
          error instanceof ModelAssetError &&
          modelStatus().status === "ready"
        )
          invalidateComparisonModel(error.message);
        if (live) setReferenceError("The word reference could not be loaded.");
      });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [word.spoken?.word, referenceLabels, referenceRequest]);
  const reference = word.spoken
    ? corpusReference
      ? {
          audio: corpusReference.audio,
          variants: [{ syllables: corpusReference.syllables }],
        }
      : undefined
    : references[questionId as keyof typeof references];
  const referenceVariant =
    reference?.variants.find((variant) => {
      const target = variant.syllables.filter(
        (s) => word.spoken || s.wordIndex === word.index,
      );
      return (
        word.syllables.length > 0 &&
        target.length === word.syllables.length &&
        target.every((s, i) => s.label === word.syllables[i].label)
      );
    }) || reference?.variants[0];
  const refWord: ReferenceSyllable[] =
    referenceVariant?.syllables.filter(
      (s) => word.spoken || s.wordIndex === word.index,
    ) || [];
  const syllables = word.syllables.length
    ? word.syllables
    : refWord.map((s) => ({ ...s, similarity: null }));
  const [index, setIndex] = useState(0);
  const activeIndex = Math.min(index, Math.max(0, syllables.length - 1));
  const current = syllables[activeIndex];
  const standard =
    !word.spoken ||
    !word.syllables.length ||
    refWord.map((s) => s.label).join("|") === referenceLabels
      ? refWord.find((s) => s.syllableIndex === current?.syllableIndex)
      : undefined;
  const original = word.syllables.find(
    (s) => s.syllableIndex === current?.syllableIndex,
  );
  const [phase, setPhase] = useState("idle"),
    phaseRef = useRef("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [grade, setGrade] = useState<Pronunciation>();
  const [retryUrl, setRetryUrl] = useState("");
  const clip = useRef("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const job = useRef<ReturnType<typeof scoreRecording> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const alive = useRef(true);
  const reward = useMutation(reviewRewardMutation(useQueryClient()));
  const transition = (value: string) => {
    phaseRef.current = value;
    setPhase(value);
  };
  const stopTracks = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      job.current?.cancel();
      if (recorder.current?.state === "recording") recorder.current.stop();
      stopTracks();
      if (clip.current) URL.revokeObjectURL(clip.current);
    };
  }, []);
  const stop = () => {
    clearTimeout(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    stopTracks();
  };
  async function record() {
    if (
      ["permission", "recording", "grading"].includes(phaseRef.current) ||
      !current
    )
      return;
    stopReviewAudio();
    transition("permission");
    setError("");
    setGrade(undefined);
    setMessage("");
    reward.reset();
    if (clip.current) URL.revokeObjectURL(clip.current);
    clip.current = "";
    setRetryUrl("");
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error("Recording is unavailable in this browser.");
      const next = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        next.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = next;
      const capture = new MediaRecorder(next);
      recorder.current = capture;
      const chunks: BlobPart[] = [];
      capture.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      capture.onerror = () => {
        stopTracks();
        clearTimeout(timer.current);
        if (alive.current) {
          setError("Recording failed. Try recording again.");
          transition("error");
        }
      };
      capture.onstop = async () => {
        stopTracks();
        clearTimeout(timer.current);
        if (!alive.current || phaseRef.current === "error") return;
        const blob = new Blob(chunks, {
          type: capture.mimeType || "audio/webm",
        });
        if (!blob.size) {
          setError("No audio was captured. Try again.");
          transition("error");
          return;
        }
        clip.current = URL.createObjectURL(blob);
        setRetryUrl(clip.current);
        transition("grading");
        const operation = scoreRecording(
          clip.current,
          expected,
          (value) => {
            if (alive.current) setMessage(value);
          },
          {
            word: scriptKey(word.spoken?.word || current.word),
            wordIndex: word.index,
            syllableIndex: current.syllableIndex,
            syllableCount: syllables.length,
          },
        );
        job.current = operation;
        try {
          const value = await operation.promise;
          if (!alive.current) return;
          setGrade(value);
          transition("done");
          if (value.syllables.length) {
            try {
              const saved = await reward.mutateAsync({
                attemptId,
                questionId,
                wordIndex: word.index,
                syllableIndex: current.syllableIndex,
                result: value,
              });
              if (alive.current) {
                if (saved.xp)
                  toast.success(`+${saved.xp} XP for syllable practice`);
                else if (!saved.retained)
                  setError(
                    "This session is no longer stored. No XP was saved.",
                  );
              }
            } catch {
              if (alive.current)
                setError("Feedback is ready, but XP could not be saved.");
            }
          }
        } catch (e) {
          if (alive.current) {
            transition("error");
            setError(
              e instanceof DOMException && e.name === "AbortError"
                ? "Grading cancelled. No XP awarded."
                : e instanceof Error
                  ? e.message
                  : "Could not grade this recording.",
            );
          }
        } finally {
          job.current = null;
          if (alive.current) setMessage("");
        }
      };
      capture.start();
      transition("recording");
      timer.current = setTimeout(stop, 8000);
    } catch (e) {
      stopTracks();
      if (alive.current) {
        transition("error");
        setError(
          e instanceof Error ? e.message : "Microphone access was not granted.",
        );
      }
    }
  }
  const busy = ["permission", "recording", "grading"].includes(phase);
  const result = grade?.syllables[0];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="practice-ui syllable-practice">
        <div className="syllable-practice-scroll">
          <DialogTitle>{word.word}</DialogTitle>
          <DialogDescription className="sr-only">
            {syllables.length
              ? "Listen and practise a syllable from this word."
              : "Review this recognised word."}
          </DialogDescription>
          <fieldset
            disabled={busy}
            className="paired-audio"
            aria-label="Word audio comparison"
          >
            {recording && (word.spoken || word.syllables.length > 0) && (
              <AudioPlayer
                src={recording}
                label="Your word"
                start={
                  word.spoken?.start ??
                  Math.min(...word.syllables.map((s) => s.start))
                }
                end={
                  word.spoken?.end ??
                  Math.max(...word.syllables.map((s) => s.end))
                }
              />
            )}
            {reference && refWord.length > 0 && (
              <AudioPlayer
                src={word.spoken ? reference.audio : asset(reference.audio)}
                label="Reference pronunciation"
                start={Math.min(...refWord.map((s) => s.start))}
                end={Math.max(...refWord.map((s) => s.end))}
              />
            )}
          </fieldset>
          {referenceError && <p role="status">{referenceError}</p>}
          {word.spoken && !word.syllables.length && (
            <p>
              No reliable syllable grade is available for this recognised word.
            </p>
          )}
          {syllables.length > 0 && (
            <div
              className="syllable-choices"
              role="group"
              aria-label="Choose a syllable"
            >
              {syllables.map((s, i) => (
                <Button
                  key={s.syllableIndex}
                  variant={activeIndex === i ? "secondary" : "outline"}
                  disabled={busy || reward.isPending}
                  aria-pressed={activeIndex === i}
                  onClick={() => {
                    setIndex(i);
                    setGrade(undefined);
                    setRetryUrl("");
                    setError("");
                    transition("idle");
                    reward.reset();
                  }}
                >
                  Syllable {i + 1}
                  <span data-tone={similarityTone(s.similarity)}>
                    {s.similarity === null
                      ? "Uncertain"
                      : `${Math.round(s.similarity)}/100 similarity`}
                  </span>
                </Button>
              ))}
            </div>
          )}
          {current && (
            <div className="syllable-detail">
              <h3>Practise syllable {activeIndex + 1}</h3>
              <fieldset
                disabled={busy}
                className="paired-audio"
                aria-label="Syllable audio comparison"
              >
                {recording && original && (
                  <AudioPlayer
                    key={`your-${activeIndex}`}
                    src={recording}
                    start={original.start}
                    end={original.end}
                    label="Your syllable"
                  />
                )}
                {standard && reference && (
                  <AudioPlayer
                    key={`reference-${activeIndex}`}
                    src={word.spoken ? reference.audio : asset(reference.audio)}
                    start={standard.start}
                    end={standard.end}
                    label="Reference syllable"
                  />
                )}
              </fieldset>
              {retryUrl && (
                <AudioPlayer src={retryUrl} label="Your new syllable" />
              )}
            </div>
          )}
          <Collapsible>
            <CollapsibleTrigger render={<Button variant="ghost" size="sm" />}>
              Practice details{" "}
              <ChevronDown aria-hidden="true" className="size-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="disclosure-panel">
              <div className="word-practice-details">
                {current && (
                  <p>
                    Listen, choose a syllable, then record it. Earn 5 XP per
                    syllable each day for completing practice.
                  </p>
                )}
                {corpusReference && (
                  <p>
                    Synthetic{" "}
                    {referenceAccentNames[corpusReference.accent] || "English"}{" "}
                    reference · not human verified
                  </p>
                )}
                <p>
                  {reference && (
                    <>
                      Synthetic reference example; timings are approximate. All
                      four supported accents remain valid.{" "}
                    </>
                  )}
                  Similarity is not pronunciation correctness or an exam score.
                  {current && " Retry audio stays in this view."}
                </p>
                {syllables.length > 0 && (
                  <div>
                    <h3>Sound notation</h3>
                    {syllables.map((syllable, i) => (
                      <p key={syllable.syllableIndex}>
                        Syllable {i + 1}: /
                        {syllable.label.replace(/[012]/g, "")}/
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
        {current && (
          <div className="syllable-practice-footer">
            <div className="retry-actions">
              {phase === "recording" ? (
                <Button onClick={stop}>
                  <Square />
                  Stop and grade
                </Button>
              ) : (
                <Button
                  onClick={() => void record()}
                  disabled={busy || !ready || reward.isPending}
                >
                  <Mic />
                  {phase === "permission"
                    ? "Requesting microphone…"
                    : "Record syllable"}
                </Button>
              )}
              {phase === "grading" && (
                <Button variant="outline" onClick={() => job.current?.cancel()}>
                  <X />
                  Cancel grading
                </Button>
              )}
              <span role="status">
                {phase === "recording"
                  ? "Speak this syllable · up to 8 seconds"
                  : message}
              </span>
            </div>
            {error && <p role="alert">{error}</p>}
            {grade && (
              <p
                role="status"
                className="retry-result"
                data-tone={similarityTone(result?.similarity ?? null)}
              >
                {result
                  ? result.similarity === null
                    ? "Uncertain · no reliable score for this syllable."
                    : `${Math.round(result.similarity)}/100 reference similarity`
                  : "No reliable speech detected. Try speaking closer to the microphone."}
                {reward.data?.xp === 0 &&
                  reward.data.retained &&
                  " · Already practised for XP today"}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
