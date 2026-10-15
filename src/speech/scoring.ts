import { z } from "zod";
import type { Question } from "../content";
import { MAX_AUDIO_SECONDS } from "./config";
export const transcriptionSchema = z.object({
  text: z.string().max(10_000),
  seconds: z.number().positive().max(MAX_AUDIO_SECONDS),
  engine: z.string().max(100),
  model: z.string().max(100),
  revision: z.string().max(100),
});
export type Transcription = z.infer<typeof transcriptionSchema>;
// Keep contractions as words; punctuation/case cannot create apparent errors.
export function spokenWords(text: string): string[] {
  return (
    text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) || []
  );
}
export type AlignedWord = {
  expected?: string;
  heard?: string;
  kind: "match" | "substitution" | "missing" | "extra";
};
export function compareWords(reference: string, transcript: string) {
  const expected = spokenWords(reference),
    heard = spokenWords(transcript);
  if (!expected.length || !heard.length) return null;
  // Bounded inputs avoid quadratic allocation for corrupted/history data.
  if (expected.length > 500 || heard.length > 500) return null;
  const distance = Array.from(
    { length: expected.length + 1 },
    () => new Uint16Array(heard.length + 1),
  );
  for (let i = 0; i <= expected.length; i++) distance[i][0] = i;
  for (let j = 0; j <= heard.length; j++) distance[0][j] = j;
  for (let i = 1; i <= expected.length; i++)
    for (let j = 1; j <= heard.length; j++)
      distance[i][j] = Math.min(
        distance[i - 1][j] + 1,
        distance[i][j - 1] + 1,
        distance[i - 1][j - 1] + (expected[i - 1] === heard[j - 1] ? 0 : 1),
      );
  let i = expected.length,
    j = heard.length;
  const alignment: AlignedWord[] = [];
  while (i || j) {
    if (
      i &&
      j &&
      distance[i][j] ===
        distance[i - 1][j - 1] + (expected[i - 1] === heard[j - 1] ? 0 : 1)
    ) {
      alignment.push({
        expected: expected[i - 1],
        heard: heard[j - 1],
        kind: expected[i - 1] === heard[j - 1] ? "match" : "substitution",
      });
      i--;
      j--;
    } else if (i && distance[i][j] === distance[i - 1][j] + 1) {
      alignment.push({ expected: expected[i - 1], kind: "missing" });
      i--;
    } else {
      alignment.push({ heard: heard[j - 1], kind: "extra" });
      j--;
    }
  }
  const errors = distance[expected.length][heard.length];
  return {
    accuracy: Math.round(Math.max(0, 1 - errors / expected.length) * 100),
    errors,
    referenceWords: expected.length,
    alignment: alignment.reverse(),
  };
}
const shortAnswer = (text: string) =>
  spokenWords(text)
    .join(" ")
    .replace(/^(a|an|the) /, "");
export function speechFeedback(q: Question, t: Transcription) {
  const words = spokenWords(t.text).length;
  const reference =
    q.type === "read-aloud"
      ? q.text
      : q.type === "repeat-sentence"
        ? q.audioText
        : undefined;
  return {
    words,
    wordsPerMinute: words ? Math.round((words / t.seconds) * 60) : null,
    comparison: reference ? compareWords(reference, t.text) : null,
    answerMatch:
      q.type === "answer-short-question" && words > 0
        ? shortAnswer(t.text) === shortAnswer(q.model || "")
        : null,
  };
}
