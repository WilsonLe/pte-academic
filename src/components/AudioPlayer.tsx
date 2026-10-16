import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Volume2 } from "lucide-react";
import { Button } from "./ui/button";

let playingAudio: HTMLAudioElement | null = null;
export const stopReviewAudio = () => playingAudio?.pause();
const time = (seconds: number) => {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
};

/** Shared visual control; Runner owns the lifecycle of one-play timed prompts. */
export function AudioStartButton({
  onClick,
  label = "Play audio",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <Button
      className="audio-play"
      variant="secondary"
      onClick={onClick}
      aria-label={label}
    >
      <Play />
      {label}
    </Button>
  );
}

export function AudioPlayer({
  src,
  label,
  showLabel = true,
  start = 0,
  end,
}: {
  src: string;
  label: string;
  showLabel?: boolean;
  start?: number;
  end?: number;
}) {
  const displayTime = (seconds: number) =>
    end === undefined ? time(seconds) : `${Math.max(0, seconds).toFixed(2)}s`;
  const audio = useRef<HTMLAudioElement>(null);
  const generation = useRef(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const clearStop = () => clearTimeout(stopTimer.current);
  const scheduleStop = () => {
    clearStop();
    const node = audio.current;
    if (!node || end === undefined) return;
    stopTimer.current = setTimeout(
      () => {
        node.pause();
        node.currentTime = start;
        setPosition(0);
      },
      Math.max(0, ((end - node.currentTime) * 1000) / node.playbackRate),
    );
  };
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    generation.current++;
    setPlaying(false);
    setPosition(0);
    setDuration(0);
    setError("");
    setWaiting(false);
    const node = audio.current;
    return () => {
      generation.current++;
      clearStop();
      node?.pause();
      if (playingAudio === node) playingAudio = null;
    };
  }, [src, start, end]);
  const syncDuration = () => {
    const value = audio.current?.duration;
    if (value && Number.isFinite(value))
      setDuration(Math.max(0, Math.min(end ?? value, value) - start));
  };
  const fail = () => {
    setPlaying(false);
    setWaiting(false);
    setError("Audio is unavailable. Try again.");
  };
  async function toggle() {
    const node = audio.current;
    if (!node) return;
    if (!node.paused) {
      node.pause();
      return;
    }
    const current = generation.current;
    setError("");
    setWaiting(true);
    try {
      if (
        node.ended ||
        node.currentTime < start ||
        (end !== undefined && node.currentTime >= end)
      )
        node.currentTime = start;
      await node.play();
    } catch {
      if (current === generation.current) {
        setWaiting(false);
        setError("Audio could not start. Press play to try again.");
      }
    }
  }
  return (
    <div className="audio-player" role="group" aria-label={label}>
      <audio
        key={src}
        ref={audio}
        src={src}
        preload="metadata"
        onLoadedMetadata={() => {
          syncDuration();
          if (audio.current) audio.current.currentTime = start;
        }}
        onDurationChange={syncDuration}
        onTimeUpdate={() => {
          setPosition(Math.max(0, (audio.current?.currentTime || 0) - start));
          syncDuration();
        }}
        onPlay={() => {
          if (playingAudio && playingAudio !== audio.current)
            playingAudio.pause();
          playingAudio = audio.current;
          setPlaying(true);
        }}
        onPlaying={() => {
          setWaiting(false);
          scheduleStop();
        }}
        onWaiting={() => {
          setWaiting(true);
          clearStop();
        }}
        onPause={() => {
          clearStop();
          setPlaying(false);
          setWaiting(false);
        }}
        onEnded={() => {
          setPlaying(false);
          setWaiting(false);
        }}
        onError={fail}
      />
      <Button
        className="audio-play"
        size="icon"
        variant="secondary"
        aria-label={`${playing ? "Pause" : "Play"} ${label}`}
        onClick={() => void toggle()}
      >
        {playing ? <Pause /> : <Play />}
      </Button>
      <div className="audio-track">
        <div className="audio-caption">
          <span className={showLabel ? undefined : "sr-only"}>{label}</span>
          <span>
            {displayTime(position)} / {displayTime(duration)}
          </span>
        </div>
        <input
          type="range"
          aria-label={`Seek ${label}`}
          min={0}
          max={duration || 1}
          step={0.1}
          disabled={!duration}
          value={Math.min(position, duration || 0)}
          aria-valuetext={`${displayTime(position)} of ${displayTime(duration)}`}
          onChange={(event) => {
            if (audio.current) {
              audio.current.currentTime = start + Number(event.target.value);
              if (!audio.current.paused) scheduleStop();
              setPosition(Number(event.target.value));
            }
          }}
        />
        {waiting && (
          <span role="status" className="audio-status">
            Loading audio…
          </span>
        )}
        {error && (
          <div role="alert" className="audio-error">
            {error}
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Retry ${label}`}
              onClick={() => {
                setError("");
                audio.current?.load();
                void toggle();
              }}
            >
              <RotateCcw />
              Retry
            </Button>
          </div>
        )}
      </div>
      <Volume2 className="audio-speaker" aria-hidden="true" />
    </div>
  );
}
