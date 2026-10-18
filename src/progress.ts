import { variedPool } from "./practice-order";
import { z } from "zod";
import { questions, guideFor, type Answer } from "./content";
import type { Result } from "./Runner";
const daySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  questionIds: z.array(z.string()),
});
export const progressSchema = z.object({
  version: z.literal(1),
  xp: z.number().int().nonnegative(),
  reviewDay: z.string().default(""),
  reviewed: z.array(z.string()).max(1000).default([]),
  seen: z.array(z.string()),
  earned: z.array(z.string()).default([]),
  days: z.array(daySchema).max(365),
  lastDay: z.string(),
  streak: z.number().int().nonnegative(),
  longest: z.number().int().nonnegative(),
});
export type Progress = z.infer<typeof progressSchema>;
export type Reward = {
  xp: number;
  badges: string[];
  levelUp: boolean;
  dailyComplete: boolean;
};
export const rewardSchema = z.object({
  xp: z.number().int().nonnegative(),
  badges: z.array(z.string()),
  levelUp: z.boolean(),
  dailyComplete: z.boolean(),
});
export const emptyProgress = (): Progress => ({
  version: 1,
  xp: 0,
  reviewDay: "",
  reviewed: [],
  seen: [],
  earned: [],
  days: [],
  lastDay: "",
  streak: 0,
  longest: 0,
});
export function localDay(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
export function shiftDay(day: string, offset: number) {
  const [y, m, d] = day.split("-").map(Number);
  return localDay(new Date(y, m - 1, d + offset, 12));
}
export const levelFor = (xp: number) => Math.floor(xp / 150) + 1;
export const answered = (answer: Answer | undefined) =>
  !!(
    answer?.text?.trim() ||
    answer?.values?.some((v) => v.trim()) ||
    answer?.recording
  );
export const dayCount = (p: Progress, day = localDay()) =>
  p.days.find((d) => d.date === day)?.questionIds.length || 0;
export const currentStreak = (p: Progress, day = localDay()) =>
  p.lastDay === day || p.lastDay === shiftDay(day, -1) ? p.streak : 0;
export const badges = [
  {
    id: "first",
    title: "First spark",
    description: "Answer your first practice question.",
    target: 1,
  },
  {
    id: "daily",
    title: "Daily finisher",
    description: "Answer three different questions in one day.",
    target: 3,
  },
  {
    id: "explorer",
    title: "Trail finder",
    description: "Try five different question types.",
    target: 5,
  },
  {
    id: "worlds",
    title: "All rounder",
    description: "Practise Speaking & Writing, Reading and Listening.",
    target: 3,
  },
  {
    id: "streak",
    title: "On a roll",
    description: "Practise on three consecutive days.",
    target: 3,
  },
  {
    id: "variety",
    title: "Full spectrum",
    description: "Try all 22 question types.",
    target: 22,
  },
] as const;
export function badgeCount(id: string, p: Progress) {
  const types = new Set(
    p.seen
      .map((id) => questions.find((q) => q.id === id)?.type)
      .filter(Boolean),
  );
  if (id === "first") return Math.min(1, p.seen.length);
  if (id === "daily")
    return Math.max(0, ...p.days.map((d) => d.questionIds.length));
  if (id === "worlds")
    return new Set(
      p.seen
        .map((id) => questions.find((q) => q.id === id))
        .filter(Boolean)
        .map((q) => guideFor(q!).section),
    ).size;
  if (id === "streak") return p.longest;
  return types.size;
}
export const unlockedBadges = (p: Progress) => [
  ...new Set([
    ...p.earned,
    ...badges.filter((b) => badgeCount(b.id, p) >= b.target).map((b) => b.id),
  ]),
];
export function awardPractice(
  before: Progress,
  result: Result,
  day = localDay(),
) {
  const p = structuredClone(before);
  const ids = [...new Set(result.questionIds)].filter(
    (id) => questions.some((q) => q.id === id) && answered(result.answers[id]),
  );
  const existing = p.days.find((d) => d.date === day);
  const known = new Set(existing?.questionIds || []);
  const fresh = ids.filter((id) => !known.has(id));
  const reward: Reward = {
    xp: 0,
    badges: [],
    levelUp: false,
    dailyComplete: false,
  };
  if (!fresh.length) return { progress: p, reward };
  const previousCount = known.size;
  fresh.forEach((id) => known.add(id));
  reward.dailyComplete = previousCount < 3 && known.size >= 3;
  reward.xp = fresh.length * 10 + (reward.dailyComplete ? 30 : 0);
  p.xp += reward.xp;
  p.seen = [...new Set([...p.seen, ...fresh])];
  if (existing) existing.questionIds = [...known];
  else p.days.push({ date: day, questionIds: [...known] });
  p.days = p.days.sort((a, b) => a.date.localeCompare(b.date)).slice(-365);
  if (day > p.lastDay) {
    p.streak = p.lastDay === shiftDay(day, -1) ? p.streak + 1 : 1;
    p.lastDay = day;
    p.longest = Math.max(p.longest, p.streak);
  }
  const previously = new Set(unlockedBadges(before));
  reward.badges = unlockedBadges(p).filter((id) => !previously.has(id));
  p.earned = unlockedBadges(p);
  reward.levelUp = levelFor(p.xp) > levelFor(before.xp);
  return { progress: p, reward };
}
export function questQuestions(
  p: Progress,
  day = localDay(),
  history: readonly Pick<Result, "questionIds">[] = [],
  random = Math.random,
) {
  const done = new Set(p.days.find((d) => d.date === day)?.questionIds || []);
  const remaining = Math.max(0, 3 - done.size);
  const reading = questions.filter(
    (q) => guideFor(q).section === "reading" && !done.has(q.id),
  );
  const rotated = variedPool(reading, history, random);
  const kinds = new Set<string>();
  const varied = rotated.filter((q) => {
    if (kinds.has(q.type)) return false;
    kinds.add(q.type);
    return true;
  });
  return [...varied, ...rotated.filter((q) => !varied.includes(q))]
    .filter((q) => !done.has(q.id))
    .slice(0, remaining);
}

/** Effort reward, independent of similarity, practice quests and streaks. */
export function awardReview(before: Progress, key: string, day = localDay()) {
  const progress = structuredClone(before);
  if (progress.reviewDay !== day) {
    progress.reviewDay = day;
    progress.reviewed = [];
  }
  const fresh =
    !progress.reviewed.includes(key) && progress.reviewed.length < 1000;
  if (fresh) {
    progress.reviewed.push(key);
    progress.xp += 5;
  }
  return { progress, xp: fresh ? 5 : 0 };
}
