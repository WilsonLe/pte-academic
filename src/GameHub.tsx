import { Link } from "@tanstack/react-router";
import { type ScreenId } from "./routing";
import { useState, type CSSProperties } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  Compass,
  Crown,
  Flame,
  Gem,
  Headphones,
  ListChecks,
  LockKeyhole,
  Mic,
  Orbit,
  Rocket,
  Sparkles,
  Target,
  Trophy,
  Zap,
} from "lucide-react";
import {
  badges,
  badgeCount,
  currentStreak,
  dayCount,
  levelFor,
  shiftDay,
  unlockedBadges,
  type Progress,
} from "./progress";
import { questions, guideFor } from "./content";
import { Button } from "./components/ui/button";
import { CardsList } from "./components/CardsList";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./components/ui/dialog";
const badgeIcons = [Zap, Target, Compass, Orbit, Flame, Gem];
const trackIcons = { speaking: Mic, reading: BookOpen, listening: Headphones };
export function GameStatus({
  progress,
  today,
  onClick,
}: {
  progress: Progress;
  today: string;
  onClick: () => void;
}) {
  return (
    <div className="game-status">
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              className="xp-chip"
              aria-label={
                progress.xp +
                " XP, level " +
                levelFor(progress.xp) +
                ". View progress"
              }
              onClick={onClick}
            />
          }
        >
          <Zap className="size-3.5" fill="currentColor" />
          <span>
            {progress.xp}
            <span className="hidden sm:inline"> XP</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Level {levelFor(progress.xp)} · practice XP
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              className="streak-chip"
              aria-label={
                currentStreak(progress, today) + " day streak. View progress"
              }
              onClick={onClick}
            />
          }
        >
          <Flame className="size-4" />
          {currentStreak(progress, today)}
        </TooltipTrigger>
        <TooltipContent>Current practice streak</TooltipContent>
      </Tooltip>
    </div>
  );
}
export function GameHub({
  view,
  progress: p,
  today,
  ready,
  onQuest,
  navigate,
}: {
  view: string;
  progress: Progress;
  today: string;
  ready: boolean;
  onQuest: () => void;
  navigate: (page: ScreenId) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const done = Math.min(3, dayCount(p, today)),
    complete = done >= 3,
    level = levelFor(p.xp),
    unlocked = unlockedBadges(p);
  const selectedBadge = badges.find((b) => b.id === selected);
  const date = new Date(today + "T12:00:00"),
    monday = shiftDay(today, -((date.getDay() + 6) % 7));
  return (
    <div className={"game-hub hub-" + view}>
      {view !== "play" && (
        <div className="hub-heading">
          <h2>
            {view === "progress" ? "Your progress" : "Your achievements"}
            <span className="accent-dot">.</span>
          </h2>
        </div>
      )}
      <div className="quest-grid">
        {view === "play" && (
          <section
            className={"quest-card " + (complete ? "quest-complete" : "")}
            aria-label="Daily practice"
          >
            <div className="quest-topline">
              <span>
                <Sparkles className="size-3.5" />
                DAILY PRACTICE
              </span>
            </div>
            <div className="quest-body">
              <div
                className="quest-orbit"
                role="progressbar"
                aria-label="Daily questions answered"
                aria-valuenow={done}
                aria-valuemin={0}
                aria-valuemax={3}
              >
                <svg viewBox="0 0 120 120" aria-hidden="true">
                  <circle cx="60" cy="60" r="49" className="orbit-track" />
                  <circle
                    cx="60"
                    cy="60"
                    r="49"
                    className="orbit-fill"
                    style={{ strokeDashoffset: 308 * (1 - done / 3) }}
                  />
                </svg>
                <div className="orbit-centre">
                  {complete ? (
                    <Check className="size-8" />
                  ) : (
                    <Rocket className="size-8" />
                  )}
                  <span>
                    {done}
                    <small> / 3</small>
                  </span>
                </div>
                <span className="orbit-spark spark-one" />
                <span className="orbit-spark spark-two" />
              </div>
              <div className="quest-summary">
                {!complete && (
                  <span className="quest-prize">
                    <Zap className="size-3.5" fill="currentColor" />+
                    {(3 - done) * 10 + 30} XP
                  </span>
                )}
                <h3>
                  {complete
                    ? "Daily goal complete"
                    : done
                      ? `${3 - done} more to go`
                      : "Your next 3 questions"}
                </h3>
              </div>
            </div>
            <div className="quest-bottom">
              <Button
                disabled={!ready}
                onClick={complete ? () => navigate("types") : onQuest}
                className="quest-start"
              >
                {complete
                  ? "Keep practising"
                  : done
                    ? "Continue daily quest"
                    : "Start daily quest"}
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </section>
        )}
        {view === "progress" && (
          <section className="level-card" aria-label="Practice level">
            <div className="level-top">
              <div className="rank-emblem">
                <Crown className="size-7" />
              </div>
              <div>
                <p className="game-eyebrow">
                  LEVEL {String(level).padStart(2, "0")}
                </p>
                <h3>
                  {level === 1
                    ? "Getting started"
                    : level < 4
                      ? "Finding your stride"
                      : level < 8
                        ? "Building momentum"
                        : "Going places"}
                </h3>
              </div>
              <span className="mini-star" aria-hidden="true">
                ✦
              </span>
            </div>
            <div className="xp-meter-label">
              <span>
                <Zap className="size-3.5" />
                {p.xp} XP
              </span>
              <span>
                {150 - (p.xp % 150)} to level {level + 1}
              </span>
            </div>
            <div
              className="xp-meter"
              role="progressbar"
              aria-label="Progress to next level"
              aria-valuenow={p.xp % 150}
              aria-valuemin={0}
              aria-valuemax={150}
            >
              <span style={{ width: ((p.xp % 150) / 150) * 100 + "%" }} />
            </div>
            <div className="activity-heading">
              <span>
                <Flame className="size-4" />
                <strong>{currentStreak(p, today)}</strong> day streak
              </span>
              <span>This week</span>
            </div>
            <div className="activity-week" aria-label="This week's practice">
              {Array.from({ length: 7 }, (_, i) => {
                const day = shiftDay(monday, i),
                  active = dayCount(p, day) > 0;
                return (
                  <Tooltip key={day}>
                    <TooltipTrigger
                      render={
                        <span
                          tabIndex={0}
                          className={
                            "activity-day " +
                            (active ? "active " : "") +
                            (day === today ? "today" : "")
                          }
                          aria-label={
                            day +
                            ": " +
                            dayCount(p, day) +
                            " questions answered"
                          }
                        />
                      }
                    >
                      <small>{["M", "T", "W", "T", "F", "S", "S"][i]}</small>
                      <span>
                        {active ? (
                          <Check className="size-3.5" />
                        ) : day === today ? (
                          <span className="today-dot" />
                        ) : (
                          <span className="rest-dot" />
                        )}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {dayCount(p, day)} questions · {day}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </section>
        )}
      </div>
      {view === "play" && (
        <>
          <div className="mode-heading">
            <h3>Pick your practice</h3>
            <span>Go at your own pace</span>
          </div>
          <CardsList
            className="practice-modes"
            gridClassName="mode-grid"
            label="practice mode pages"
            minCardWidth={0}
            minCardHeight={80}
            maxCardHeight={140}
            maxColumns={3}
            maxRows={1}
            items={[
              {
                to: "/types" as const,
                title: "Question types",
                detail: "Focus on one skill",
                count: "22",
                icon: Target,
                tone: "violet",
              },
              {
                to: "/sections" as const,
                title: "Sections",
                detail: "Connect the pieces",
                count: "03",
                icon: ListChecks,
                tone: "mint",
              },
              {
                to: "/mocks" as const,
                title: "Mock tests",
                detail: "Put it all together",
                count: "01",
                icon: Trophy,
                tone: "peach",
              },
            ]}
            render={(mode, i) => (
              <Link
                to={mode.to}
                key={mode.to}
                className={"game-mode mode-" + mode.tone}
                style={{ "--order": i } as CSSProperties}
              >
                <div className="mode-top">
                  <span className="mode-icon">
                    <mode.icon className="size-5" />
                  </span>
                  <span className="mode-count">{mode.count}</span>
                </div>
                <div className="mode-bottom">
                  <div>
                    <h4>{mode.title}</h4>
                    <p>{mode.detail}</p>
                  </div>
                  <span className="mode-arrow">
                    <ArrowRight className="size-4" />
                  </span>
                </div>
              </Link>
            )}
          />
        </>
      )}
      {view === "badges" && (
        <>
          <p className="badge-summary">
            {unlocked.length} / {badges.length} earned
          </p>
          <CardsList
            className="badge-list"
            gridClassName="badge-shelf"
            label="achievement pages"
            minCardWidth={140}
            minCardHeight={128}
            maxCardHeight={260}
            maxColumns={3}
            maxRows={2}
            items={badges}
            render={(badge, i) => {
              const Icon = badgeIcons[i],
                earned = unlocked.includes(badge.id);
              return (
                <Tooltip key={badge.id}>
                  <TooltipTrigger
                    render={
                      <button
                        className={
                          "achievement " +
                          (earned ? "earned " : "") +
                          "badge-" +
                          i
                        }
                        aria-label={
                          badge.title +
                          ", " +
                          (earned ? "earned" : "not earned") +
                          ". View achievement"
                        }
                        onClick={() => setSelected(badge.id)}
                      />
                    }
                  >
                    <span className="achievement-icon">
                      <Icon className="size-6" />
                      <span className="achievement-status">
                        {earned ? (
                          <Check className="size-2.5" />
                        ) : (
                          <LockKeyhole className="size-2.5" />
                        )}
                      </span>
                    </span>
                    <span>{badge.title}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {earned ? "Earned" : badge.description}
                  </TooltipContent>
                </Tooltip>
              );
            }}
          />
        </>
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="practice-ui">
          {selectedBadge && (
            <>
              <div
                className={
                  "badge-detail-icon " +
                  (unlocked.includes(selectedBadge.id) ? "earned" : "")
                }
              >
                <Trophy className="size-8" />
              </div>
              <DialogTitle>{selectedBadge.title}</DialogTitle>
              <DialogDescription>
                {selectedBadge.description}{" "}
                {unlocked.includes(selectedBadge.id)
                  ? "Achievement earned!"
                  : Math.min(
                      selectedBadge.target,
                      badgeCount(selectedBadge.id, p),
                    ) +
                    " / " +
                    selectedBadge.target +
                    " so far."}
              </DialogDescription>
              <p className="text-xs text-muted-foreground">
                Practice milestones celebrate effort. Your XP and badges stay on
                this device.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function TrackProgress({
  progress,
  section,
}: {
  progress: Progress;
  section: string;
}) {
  const available = questions.filter((q) => guideFor(q).section === section),
    count = available.filter((q) => progress.seen.includes(q.id)).length;
  const Icon = trackIcons[section as keyof typeof trackIcons];
  return (
    <div className="track-progress" data-track={section}>
      <span className="track-progress-icon">
        <Icon className="size-4" />
      </span>
      <span>
        {count} / {available.length} explored
      </span>
      <div className="track-meter">
        <span style={{ width: (count / available.length) * 100 + "%" }} />
      </div>
    </div>
  );
}
