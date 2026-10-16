import {
  pronunciationSummary,
  type Pronunciation,
} from "./speech/comparison-schema";
import { z } from "zod";
import guideData from "../content/guides.json";
import questionData from "../content/questions.json";
import mockData from "../content/mock-tests.json";
import sectionData from "../content/sections.json";
import type { Transcription } from "./speech/scoring";
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
};
export function feedback(q: Question, a: Answer) {
  const g = guideFor(q);
  if (
    g.kind === "speak" &&
    (q.type === "read-aloud" || q.type === "repeat-sentence")
  ) {
    const score = a.pronunciation
      ? pronunciationSummary(a.pronunciation)
      : null;
    return {
      label:
        score === null
          ? a.recording
            ? "Score your speech"
            : "No recording"
          : `${score}/100 reference similarity`,
      detail:
        "Open Speech to compare each syllable with the v3 reference model. All four included accents are accepted equally. Experimental similarity is not correctness or an exam score.",
    };
  }
  if (g.kind === "speak")
    return {
      label: a.recording ? "Listen & self-review" : "No recording",
      detail:
        "Replay your recording or transcribe it on this device for word-match feedback. Transcription does not assess pronunciation or predict a PTE score.",
    };
  if (g.kind === "write") {
    const n = wordCount(a.text || "");
    const [min, max] =
      q.type === "write-essay"
        ? [200, 300]
        : q.type === "summarize-spoken-text"
          ? [50, 70]
          : [5, 75];
    return {
      label: "Self-review",
      detail: `${n} words. Target: ${min}–${max}${q.type === "summarize-written-text" ? ", in one sentence" : ""}. Check the content, form and language against the guidance.`,
    };
  }
  if (g.kind === "dictation")
    return {
      label:
        normalize(a.text || "") === normalize(q.model || "")
          ? "Exact match"
          : "Compare sentence",
      detail:
        "Local comparison ignores case and punctuation. It does not estimate official partial credit.",
    };
  const expected = q.answers || [];
  const actual = a.values || [];
  const correct =
    g.kind === "multi" || g.kind === "highlight"
      ? actual.length === expected.length &&
        actual.every((x) => expected.includes(x))
      : expected.length === actual.length &&
        expected.every((x, i) => normalize(x) === normalize(actual[i] || ""));
  let detail = "Compare your answer with the key below.";
  if (g.kind === "multi" || g.kind === "highlight") {
    const hit = actual.filter((x) => expected.includes(x)).length,
      extra = actual.length - hit;
    detail = `${hit} correct selection${hit === 1 ? "" : "s"}, ${extra} incorrect. Local item credit: ${Math.max(0, hit - extra)}/${expected.length}; never an official score.`;
  }
  if (g.kind === "order") {
    let pairs = 0;
    for (let i = 0; i < actual.length - 1; i++) {
      const at = expected.indexOf(actual[i]);
      if (at >= 0 && expected[at + 1] === actual[i + 1]) pairs++;
    }
    detail = `${pairs}/${Math.max(0, expected.length - 1)} correct adjacent pairs. This is item feedback, not a PTE score.`;
  }
  return { label: correct ? "Correct" : "Review answer", detail };
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
