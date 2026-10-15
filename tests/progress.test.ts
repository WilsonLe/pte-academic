import { test } from "node:test";
import assert from "node:assert/strict";
import {
  awardPractice,
  emptyProgress,
  localDay,
  shiftDay,
  currentStreak,
  questQuestions,
  unlockedBadges,
  levelFor,
} from "../src/progress";
import type { Result } from "../src/Runner";
const make = (
  id: string,
  ids = ["reading-single-01"],
  answered = true,
): Result => ({
  id,
  label: "Practice",
  date: new Date().toISOString(),
  questionIds: ids,
  answers: Object.fromEntries(
    ids.map((q) => [q, answered ? { values: ["0"] } : {}]),
  ),
  finished: true,
});
test("real responses earn effort XP once per question/day; empty attempts never award", () => {
  const before = emptyProgress();
  assert.equal(
    awardPractice(before, make("empty", undefined, false), "2026-10-15").reward
      .xp,
    0,
  );
  const first = awardPractice(before, make("one"), "2026-10-15");
  assert.equal(first.reward.xp, 10);
  assert.deepEqual(first.reward.badges, ["first"]);
  assert.equal(before.xp, 0);
  const repeated = awardPractice(first.progress, make("two"), "2026-10-15");
  assert.equal(repeated.reward.xp, 0);
  const second = awardPractice(
    repeated.progress,
    make("three", ["reading-single-02"]),
    "2026-10-15",
  );
  const third = awardPractice(
    second.progress,
    make("four", ["reading-dropdown-01"]),
    "2026-10-15",
  );
  assert.equal(third.reward.xp, 40);
  assert.equal(third.progress.xp, 60);
  assert.equal(third.reward.dailyComplete, true);
  assert.ok(third.reward.badges.includes("daily"));
  assert.equal(
    awardPractice(
      third.progress,
      make("five", ["reading-dropdown-02"]),
      "2026-10-15",
    ).reward.xp,
    10,
  );
  assert.equal(questQuestions(third.progress, "2026-10-15").length, 0);
});
test("streaks use local calendar days, survive midnight and reset after a missed day", () => {
  let p = emptyProgress();
  for (const day of ["2026-10-03", "2026-10-04", "2026-10-05"])
    p = awardPractice(p, make(day), day).progress;
  assert.equal(currentStreak(p, "2026-10-05"), 3);
  assert.equal(currentStreak(p, "2026-10-06"), 3);
  assert.equal(currentStreak(p, "2026-10-07"), 0);
  assert.ok(unlockedBadges(p).includes("streak"));
  p = awardPractice(p, make("late"), "2026-10-08").progress;
  assert.equal(p.streak, 1);
  assert.equal(p.longest, 3);
  assert.equal(shiftDay("2026-10-04", -1), "2026-10-03");
  assert.equal(shiftDay("2026-10-04", 1), "2026-10-05");
  assert.equal(shiftDay("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftDay("2028-03-01", -1), "2028-02-29");
  assert.equal(localDay(new Date(2026, 9, 4, 0, 1)), "2026-10-04");
});
test("quest resumes remaining unique questions, levels and achievements survive a bounded ledger", () => {
  let p = emptyProgress();
  const quest = questQuestions(p, "2026-10-15");
  assert.equal(quest.length, 3);
  p = awardPractice(p, make("part", [quest[0].id]), "2026-10-15").progress;
  const remaining = questQuestions(p, "2026-10-15");
  assert.equal(remaining.length, 2);
  assert.ok(remaining.every((q) => q.id !== quest[0].id));
  p = awardPractice(
    p,
    make(
      "done",
      remaining.map((q) => q.id),
    ),
    "2026-10-15",
  ).progress;
  for (let i = 1; i < 370; i++)
    p = awardPractice(p, make(String(i)), shiftDay("2026-10-15", i)).progress;
  assert.equal(p.days.length, 365);
  assert.equal(p.streak, 370);
  assert.ok(unlockedBadges(p).includes("daily"));
  assert.equal(levelFor(149), 1);
  assert.equal(levelFor(150), 2);
});

test("crossing an XP threshold triggers a real level-up reward", () => {
  const before = emptyProgress();
  before.xp = 140;
  const next = awardPractice(before, make("level-up"), "2026-10-15");
  assert.equal(next.progress.xp, 150);
  assert.equal(next.reward.levelUp, true);
  assert.equal(levelFor(next.progress.xp), 2);
});
