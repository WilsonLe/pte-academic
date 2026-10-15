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
  Info,
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
  questQuestions,
  shiftDay,
  unlockedBadges,
  type Progress,
  type Reward,
} from "./progress";
import { questions, guideFor } from "./content";
import { Button } from "./components/ui/button";
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
  progress: p,
  today,
  ready,
  onQuest,
  navigate,
}: {
  progress: Progress;
  today: string;
  ready: boolean;
  onQuest: () => void;
  navigate: (page: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const done = Math.min(3, dayCount(p, today)),
    complete = done >= 3,
    level = levelFor(p.xp),
    unlocked = unlockedBadges(p);
  const quest = questQuestions(p, today),
    selectedBadge = badges.find((b) => b.id === selected);
  const date = new Date(today + "T12:00:00"),
    monday = shiftDay(today, -((date.getDay() + 6) % 7));
  return (
    <div className="game-hub">
      <div className="hub-heading">
        <div>
          <p className="game-eyebrow">YOUR PRACTICE SPACE</p>
          <h2>
            Let’s make progress<span className="accent-dot">.</span>
          </h2>
        </div>
        <span className="date-stamp">
          {date.toLocaleDateString("en-AU", {
            weekday: "short",
            day: "numeric",
            month: "short",
          })}
        </span>
      </div>
      <div className="quest-grid">
        <section
          className={"quest-card " + (complete ? "quest-complete" : "")}
          aria-label="Daily quest"
        >
          <div className="quest-topline">
            <span>
              <Sparkles className="size-3.5" />
              DAILY QUEST
            </span>
            <span className="quest-prize">
              <Zap className="size-3.5" fill="currentColor" />
              {complete
                ? "GOAL COMPLETE"
                : "+" + ((3 - done) * 10 + 30) + " XP"}
            </span>
          </div>
          <div className="quest-body">
            <div>
              <h3>
                {complete ? (
                  <>
                    Daily win.
                    <br />
                    Nicely done.
                  </>
                ) : (
                  <>
                    Three questions.
                    <br />
                    One daily win.
                  </>
                )}
              </h3>
              <p>
                {complete
                  ? "Come back tomorrow for your next quest."
                  : "A small reading round to build your rhythm."}
              </p>
            </div>
            <div className="quest-orbit">
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
          </div>
          <div
            className="quest-steps"
            aria-label={done + " of 3 daily questions answered"}
          >
            {[0, 1, 2].map((n) => (
              <span key={n} className={n < done ? "step-done" : ""}>
                <span>{n < done ? <Check className="size-3" /> : n + 1}</span>
                {n < done
                  ? "Done"
                  : guideFor(
                      quest[n - done] ||
                        questions.find((q) => q.id === "reading-single-01")!,
                    )
                      .title.replace(
                        "Multiple Choice, Single Answer",
                        "Single answer",
                      )
                      .replace("Fill in the Blanks (Dropdown)", "Fill the gaps")
                      .replace(
                        "Fill in the Blanks (Drag and Drop)",
                        "Word bank",
                      )
                      .replace(
                        "Multiple Choice, Multiple Answers",
                        "Multiple answers",
                      )}
              </span>
            ))}
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
                  ? "Continue quest"
                  : "Start quest"}
              <ArrowRight className="size-4" />
            </Button>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    className="quest-help"
                    aria-label="How quest XP works"
                  />
                }
              >
                <Info className="size-4" />
              </TooltipTrigger>
              <TooltipContent>
                10 XP for each different question answered today, plus 30 XP at
                three. Any practice mode counts. XP rewards effort.
              </TooltipContent>
            </Tooltip>
          </div>
        </section>
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
            <span className="mini-star">✦</span>
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
                          day + ": " + dayCount(p, day) + " questions answered"
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
      </div>
      <div className="mode-heading">
        <h3>Pick your practice</h3>
        <span>Go at your own pace</span>
      </div>
      <div className="mode-grid">
        {[
          {
            id: "types",
            title: "Question types",
            detail: "Focus on one skill",
            count: "22",
            icon: Target,
            tone: "violet",
          },
          {
            id: "sections",
            title: "Sections",
            detail: "Connect the pieces",
            count: "03",
            icon: ListChecks,
            tone: "mint",
          },
          {
            id: "mocks",
            title: "Mock tests",
            detail: "Put it all together",
            count: "01",
            icon: Trophy,
            tone: "peach",
          },
        ].map((mode, i) => (
          <a
            href={"#" + mode.id}
            onClick={() => navigate(mode.id)}
            key={mode.id}
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
          </a>
        ))}
      </div>
      <div className="mode-heading badge-heading">
        <h3>Little wins, collected</h3>
        <span>
          {unlocked.length} / {badges.length} unlocked
        </span>
      </div>
      <div className="badge-shelf">
        {badges.map((badge, i) => {
          const Icon = badgeIcons[i],
            earned = unlocked.includes(badge.id);
          return (
            <Tooltip key={badge.id}>
              <TooltipTrigger
                render={
                  <button
                    className={
                      "achievement " + (earned ? "earned " : "") + "badge-" + i
                    }
                    aria-label={
                      badge.title +
                      ", " +
                      (earned ? "unlocked" : "locked") +
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
                {earned ? "Unlocked" : badge.description}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent>
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
                  ? "Achievement unlocked!"
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
export function RewardMoment({
  reward,
  celebrate,
}: {
  reward: Reward;
  celebrate: boolean;
}) {
  if (!reward.xp) return null;
  return (
    <section
      className={"reward-moment " + (celebrate ? "celebrating" : "")}
      aria-label="Practice rewards"
    >
      {celebrate && (
        <div className="confetti" aria-hidden="true">
          {Array.from({ length: 14 }, (_, i) => (
            <i
              key={i}
              style={
                {
                  "--i": i,
                  "--x": ((i * 37) % 100) - 50 + "px",
                  "--turn": i * 57 + "deg",
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}
      <div className="reward-bolt">
        <Zap className="size-6" fill="currentColor" />
      </div>
      <div className="flex-1">
        <h2>
          {reward.levelUp
            ? "Level up!"
            : reward.dailyComplete
              ? "Daily quest complete!"
              : "A little stronger."}
        </h2>
        <p>
          {reward.badges.length
            ? reward.badges
                .map((id) => badges.find((b) => b.id === id)?.title)
                .join(" + ") + " unlocked"
            : "Practice saved. Keep your momentum."}
        </p>
      </div>
      <strong>
        +{reward.xp}
        <small>XP</small>
      </strong>
    </section>
  );
}
