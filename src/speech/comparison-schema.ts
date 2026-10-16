import { z } from "zod";
export const COMPARISON_MODEL_SHA =
  "2a8e9680e71c85d98f2adc8da725c56f21bd866340cf545916fdf5dff7389d1b";
export const COMPARISON_EXPORT = "blended-english-v3-fp16-storage-f32-v1";
export const COMPARISON_MAX_SECONDS = 45;
const syllable = z
  .object({
    word: z.string().max(100),
    wordIndex: z.number().int().nonnegative(),
    syllableIndex: z.number().int().nonnegative(),
    label: z.string().max(200),
    start: z.number().min(0).max(COMPARISON_MAX_SECONDS),
    end: z.number().min(0).max(COMPARISON_MAX_SECONDS),
    similarity: z.number().min(0).max(100).nullable(),
    confidence: z.number().min(0).max(1),
    status: z.enum(["scored", "uncertain"]),
  })
  .refine(
    (s) =>
      s.end >= s.start &&
      (s.status === "scored"
        ? s.similarity !== null && s.confidence >= 0.03
        : s.similarity === null),
  );
export const pronunciationSchema = z
  .object({
    schemaVersion: z.literal(1),
    modelSha256: z.literal(COMPARISON_MODEL_SHA),
    exportId: z.literal(COMPARISON_EXPORT),
    referenceAccents: z.tuple([
      z.literal("en-US"),
      z.literal("en-GB"),
      z.literal("en-AU"),
      z.literal("en-IN"),
    ]),
    seconds: z.number().positive().max(COMPARISON_MAX_SECONDS),
    status: z.enum(["scored", "unscored", "no-reliable-speech"]),
    syllables: z.array(syllable).max(600),
  })
  .refine(
    (r) =>
      r.syllables.every((s) => s.end <= r.seconds + 1e-6) &&
      (r.status === "scored"
        ? r.syllables.some((s) => s.status === "scored")
        : r.syllables.every((s) => s.status !== "scored")) &&
      (r.status !== "no-reliable-speech" || r.syllables.length === 0),
  );
export type Pronunciation = z.infer<typeof pronunciationSchema>;
export function pronunciationSummary(result: Pronunciation) {
  const values = result.syllables.flatMap((s) =>
    s.similarity === null ? [] : [s.similarity],
  );
  return values.length
    ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
    : null;
}
