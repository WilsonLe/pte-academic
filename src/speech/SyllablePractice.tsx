import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Mic, Square, X } from "lucide-react";
import { toast } from "sonner";
import { asset } from "../content";
import { AudioPlayer, stopReviewAudio } from "../components/AudioPlayer";
import { Button } from "../components/ui/button";
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
import { type FeedbackWord, similarityTone } from "./SpeechDiff";

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
  const reference = references[questionId as keyof typeof references];
  const referenceVariant =
    reference.variants.find((variant) => {
      const target = variant.syllables.filter(
        (s) => s.wordIndex === word.index,
      );
      return (
        word.syllables.length > 0 &&
        target.length === word.syllables.length &&
        target.every((s, i) => s.label === word.syllables[i].label)
      );
    }) || reference.variants[0];
  const refWord = referenceVariant.syllables.filter(
    (s) => s.wordIndex === word.index,
  );
  const syllables = word.syllables.length
    ? word.syllables
    : refWord.map((s) => ({ ...s, similarity: null }));
  const [index, setIndex] = useState(0);
  const current = syllables[index];
  const standard = refWord.find(
    (s) => s.syllableIndex === current?.syllableIndex,
  );
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
        <DialogTitle>{word.word}</DialogTitle>
        <DialogDescription>
          Listen, choose a syllable, then record it. Earn 5 XP per syllable each
          day for completing practice.
        </DialogDescription>
        <fieldset
          disabled={busy}
          className="paired-audio"
          aria-label="Word audio comparison"
        >
          {recording && word.syllables.length > 0 && (
            <AudioPlayer
              src={recording}
              label="Your word"
              start={Math.min(...word.syllables.map((s) => s.start))}
              end={Math.max(...word.syllables.map((s) => s.end))}
            />
          )}
          <AudioPlayer
            src={asset(reference.audio)}
            label="Reference word"
            start={Math.min(...refWord.map((s) => s.start))}
            end={Math.max(...refWord.map((s) => s.end))}
          />
        </fieldset>
        <div
          className="syllable-choices"
          role="group"
          aria-label="Choose a syllable"
        >
          {syllables.map((s, i) => (
            <Button
              key={s.syllableIndex}
              variant={index === i ? "secondary" : "outline"}
              disabled={busy || reward.isPending}
              aria-pressed={index === i}
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
              <span className="syllable-phonemes">
                /{s.label.replace(/[012]/g, "")}/
              </span>
              <span data-tone={similarityTone(s.similarity)}>
                {s.similarity === null
                  ? "Uncertain"
                  : `${Math.round(s.similarity)}/100`}
              </span>
            </Button>
          ))}
        </div>
        {current && (
          <div className="syllable-detail">
            <h3>Practise syllable {index + 1}</h3>
            <fieldset
              disabled={busy}
              className="paired-audio"
              aria-label="Syllable audio comparison"
            >
              {recording && original && (
                <AudioPlayer
                  key={`your-${index}`}
                  src={recording}
                  start={original.start}
                  end={original.end}
                  label="Your syllable"
                />
              )}
              {standard && (
                <AudioPlayer
                  key={`reference-${index}`}
                  src={asset(reference.audio)}
                  start={standard.start}
                  end={standard.end}
                  label="Reference syllable"
                />
              )}
            </fieldset>
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
            {retryUrl && (
              <AudioPlayer src={retryUrl} label="Your new syllable" />
            )}
          </div>
        )}
        <p className="speech-stats">
          Synthetic reference example; timings are approximate. All four
          supported accents remain valid. Similarity is not pronunciation
          correctness or an exam score. Retry audio stays in this view.
        </p>
      </DialogContent>
    </Dialog>
  );
}
