import {
  pronunciationSummary,
  type Pronunciation,
} from "./speech/comparison-schema";
import { z } from "zod";
import guideData from "../content/guides.json";
import questionData from "../content/questions.json";
import mockData from "../content/mock-tests.json";
import sectionData from "../content/sections.json";
import syllableSpellingData from "../content/syllable-spelling.json";
import type { Transcription } from "./speech/legacy-transcription";
export const syllableSpellingSchema = z.object({
  version: z.literal(1),
  groups: z.record(
    z.string(),
    z.record(z.string(), z.array(z.string().min(1)).min(1)),
  ),
  variants: z.record(
    z.string(),
    z.record(z.string(), z.array(z.string().min(1)).min(1)),
  ),
});
export const syllableSpelling =
  syllableSpellingSchema.parse(syllableSpellingData);
export const sectionId = z.enum(["speaking", "reading", "listening"]);
export const guideSchema = z.object({
  id: z.string(),
  title: z.string(),
  section: sectionId,
  kind: z.enum([
    "speak",
    "write",
    "single",
    "multi",
    "dropdown",
    "bank",
    "blanks",
    "order",
    "highlight",
    "dictation",
  ]),
  prepSeconds: z.number().nonnegative(),
  answerSeconds: z.number().nonnegative(),
  skills: z.string(),
  summary: z.string(),
  instructions: z.string(),
  tips: z.array(z.string()).min(3),
  pitfall: z.string(),
  scoring: z.string(),
  verified: z.iso.date(),
  order: z.number(),
});
export const questionSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  text: z.string().optional(),
  prompt: z.string().optional(),
  audio: z
    .string()
    .regex(/^audio\/[a-z0-9-]+\.(m4a|mp3)$/)
    .optional(),
  audioText: z.string().optional(),
  segments: z.array(z.string()).optional(),
  model: z.string().optional(),
  explanation: z.string(),
  options: z.array(z.string()).optional(),
  answers: z.array(z.string()).optional(),
  blankOptions: z.array(z.array(z.string())).optional(),
  chart: z
    .object({
      title: z.string(),
      labels: z.array(z.string()),
      values: z.array(z.number()),
      unit: z.string(),
    })
    .optional(),
});
export const guides = z.array(guideSchema).parse(guideData);
export const questions = z.array(questionSchema).parse(questionData);
export const sections = z
  .array(
    z.object({
      id: sectionId,
      title: z.string(),
      duration: z.string(),
      minutes: z.number().positive(),
      description: z.string(),
      icon: z.string(),
    }),
  )
  .parse(sectionData);
export const mocks = z
  .array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      questionIds: z.array(z.string()).min(65),
      sectionMinutes: z.object({
        speaking: z.number().positive(),
        reading: z.number().positive(),
        listening: z.number().positive(),
      }),
    }),
  )
  .parse(mockData);
export type Guide = z.infer<typeof guideSchema>;
export type Question = z.infer<typeof questionSchema>;
export type Section = Guide["section"];
export const guideFor = (q: Question) => guides.find((g) => g.id === q.type)!;
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
export type Answer = {
  text?: string;
  values?: string[];
  recording?: string;
  transcription?: Transcription;
  pronunciation?: Pronunciation;
  speechAssessment?: Pronunciation;
};
export function answerMatches(q: Question, a: Answer) {
  const kind = guideFor(q).kind;
  const expected = q.answers || [];
  const actual = a.values || [];
  if (q.answers) {
    if (kind === "multi" || kind === "highlight")
      return (
        new Set(actual).size === expected.length &&
        actual.every((value) => expected.includes(value))
      );
    return (
      expected.length === actual.length &&
      expected.every(
        (value, index) => normalize(value) === normalize(actual[index] || ""),
      )
    );
  }
  return (
    kind === "dictation" &&
    !!a.text?.trim() &&
    normalize(a.text) === normalize(q.model || "")
  );
}

export function feedback(q: Question, a: Answer) {
  const g = guideFor(q);
  if (g.kind === "speak") {
    const assessment = a.speechAssessment || a.pronunciation;
    const score = assessment ? pronunciationSummary(assessment) : null;
    return {
      label:
        score !== null
          ? `${score}/100 reference similarity`
          : assessment
            ? "No reliable score"
            : a.recording
              ? "Ready for speech feedback"
              : "No recording",
      detail: q.explanation,
    };
  }
  const hasAnswer =
    !!a.text?.trim() || !!a.values?.some((value) => value.trim());
  if (g.kind === "write") {
    const n = wordCount(a.text || "");
    const [min, max] =
      q.type === "write-essay"
        ? [200, 300]
        : q.type === "summarize-spoken-text"
          ? [50, 70]
          : [5, 75];
    const range =
      n < min
        ? `${min - n} below the minimum of ${min}`
        : n > max
          ? `${n - max} above the maximum of ${max}`
          : `within the ${min}–${max} word range`;
    return {
      label: hasAnswer ? "Self-review" : "No response",
      detail: `${n} ${n === 1 ? "word" : "words"}; ${range}.${q.type === "summarize-written-text" ? " One sentence required; check your sentence boundaries." : ""} Content and language are not automatically graded.`,
    };
  }
  const correct = answerMatches(q, a);
  if (g.kind === "dictation")
    return {
      label: !hasAnswer
        ? "No response"
        : correct
          ? "Exact match"
          : "Compare sentence",
      detail: correct
        ? "The words match the recorded sentence, ignoring case and punctuation."
        : "Compare your words with the recorded sentence. Case and punctuation are ignored; spelling and word order matter.",
    };
  const expected = q.answers || [];
  const actual = [...new Set(a.values || [])];
  let detail = "";
  if (g.kind === "multi" || g.kind === "highlight") {
    const hit = actual.filter((value) => expected.includes(value)).length;
    const extra = actual.length - hit;
    const missed = expected.length - hit;
    detail = `${hit} correct selection${hit === 1 ? "" : "s"}, ${extra} incorrect, ${missed} missed.`;
  } else if (g.kind === "order") {
    let pairs = 0;
    const order = a.values || [];
    for (let i = 0; i < order.length - 1; i++) {
      const at = expected.indexOf(order[i]);
      if (
        at >= 0 &&
        at + 1 < expected.length &&
        expected[at + 1] === order[i + 1]
      )
        pairs++;
    }
    detail = `${pairs}/${Math.max(0, expected.length - 1)} correct adjacent pairs.`;
  } else if (["dropdown", "bank", "blanks"].includes(g.kind)) {
    const hit = expected.filter(
      (value, i) => normalize(value) === normalize(a.values?.[i] || ""),
    ).length;
    detail = `${hit}/${expected.length} gaps correct.`;
  }
  return {
    label: !hasAnswer ? "No response" : correct ? "Correct" : "Review answer",
    detail,
  };
}
export const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
export const wordCount = (s: string) =>
  s.trim() ? s.trim().split(/\s+/).length : 0;
export const formatTime = (s: number) =>
  `${Math.floor(Math.max(0, s) / 60)
    .toString()
    .padStart(2, "0")}:${Math.max(0, Math.ceil(s) % 60)
    .toString()
    .padStart(2, "0")}`;
