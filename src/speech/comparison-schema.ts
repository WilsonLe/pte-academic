import { z } from "zod";
export const COMPARISON_MODEL_SHA =
  "2a8e9680e71c85d98f2adc8da725c56f21bd866340cf545916fdf5dff7389d1b";
export const COMPARISON_EXPORT = "blended-english-v3-fp16-storage-f32-v1";
export const COMPARISON_MAX_SECONDS = 45;
export const RECOGNITION_MAX_SECONDS = 125;
const syllable = z
  .object({
    word: z.string().max(100),
    wordIndex: z.number().int().nonnegative(),
    syllableIndex: z.number().int().nonnegative(),
    label: z.string().max(200),
    start: z.number().min(0).max(RECOGNITION_MAX_SECONDS),
    end: z.number().min(0).max(RECOGNITION_MAX_SECONDS),
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
    seconds: z.number().positive().max(RECOGNITION_MAX_SECONDS),
    recognition: z
      .object({
        modelId: z.literal("audio-only-words-v1"),
        words: z
          .array(
            z.object({
              word: z
                .string()
                .regex(/^[a-z]+(?:'[a-z]+)?$/)
                .max(100),
              index: z.number().int().nonnegative(),
              start: z.number().min(0).max(RECOGNITION_MAX_SECONDS),
              end: z.number().min(0).max(RECOGNITION_MAX_SECONDS),
              confidence: z.number().min(0).max(1),
              status: z.enum(["recognized", "uncertain", "unsupported"]),
            }),
          )
          .max(1000),
      })
      .optional(),
    status: z.enum(["scored", "unscored", "no-reliable-speech"]),
    syllables: z.array(syllable).max(2000),
  })
  .refine(
    (r) =>
      (r.recognition ||
        (r.seconds <= COMPARISON_MAX_SECONDS && r.syllables.length <= 600)) &&
      (!r.recognition ||
        (r.recognition.words.every(
          (w, i, all) =>
            w.index === i &&
            w.end > w.start &&
            w.end <= r.seconds + 1e-6 &&
            (i === 0 || w.start >= all[i - 1].end - 1e-6),
        ) &&
          r.syllables.every(
            (s) => r.recognition!.words[s.wordIndex]?.word === s.word,
          ))) &&
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
