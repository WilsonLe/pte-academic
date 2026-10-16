import { openDB, type DBSchema } from "idb";
import { z } from "zod";
import type { Result } from "./Runner";
import { questions } from "./content";
import { transcriptionSchema, type Transcription } from "./speech/legacy-transcription";
import {
  pronunciationSchema,
  type Pronunciation,
} from "./speech/comparison-schema";
import {
  progressSchema,
  rewardSchema,
  emptyProgress,
  awardPractice,
  localDay,
  type Progress,
  type Reward,
} from "./progress";
const indexKey = "pte-studio-history-v1";
const answerSchema = z.object({
  text: z.string().optional(),
  values: z.array(z.string()).optional(),
  transcription: transcriptionSchema.optional(),
  pronunciation: pronunciationSchema.optional(),
});
const resultSchema = z.object({
  id: z.string(),
  label: z.string(),
  date: z.iso.datetime(),
  questionIds: z
    .array(z.string())
    .refine((ids) => ids.every((id) => questions.some((q) => q.id === id))),
  answers: z.record(z.string(), answerSchema),
  finished: z.boolean(),
  reward: rewardSchema.optional(),
});
interface AttemptStore extends DBSchema {
  progress: { key: string; value: Progress };
  attempts: {
    key: string;
    value: { result: Result; recordings: Record<string, Blob> };
  };
}
let queue: Promise<unknown> = Promise.resolve();
const database = () =>
  openDB<AttemptStore>("pte-studio", 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("attempts"))
        db.createObjectStore("attempts");
      if (!db.objectStoreNames.contains("progress"))
        db.createObjectStore("progress");
    },
  });
export function readHistory(): Result[] {
  try {
    const data = z
      .array(resultSchema)
      .parse(JSON.parse(localStorage.getItem(indexKey) || "[]"));
    return data.slice(0, 10);
  } catch {
    return [];
  }
}
export function saveAttempt(result: Result) {
  const operation = queue
    .catch(() => {})
    .then(async () => {
      const recordings: Record<string, Blob> = {};
      for (const [id, a] of Object.entries(result.answers))
        if (a.recording)
          recordings[id] = await (await fetch(a.recording)).blob();
      const clean = resultSchema.parse({
        ...result,
        answers: Object.fromEntries(
          Object.entries(result.answers).map(([id, a]) => [
            id,
            {
              text: a.text,
              values: a.values,
              transcription: a.transcription,
              pronunciation: a.pronunciation,
            },
          ]),
        ),
      });
      const db = await database();
      const tx = db.transaction(["attempts", "progress"], "readwrite");
      const attemptStore = tx.objectStore("attempts");
      const prior = await attemptStore.get(result.id);
      const raw = await tx.objectStore("progress").get("profile");
      const before = progressSchema.safeParse(raw);
      const existingProgress = before.success ? before.data : emptyProgress();
      const awarded = prior
        ? {
            progress: existingProgress,
            reward: {
              xp: 0,
              badges: [],
              levelUp: false,
              dailyComplete: false,
            } satisfies Reward,
          }
        : awardPractice(
            existingProgress,
            result,
            localDay(new Date(result.date)),
          );
      const reward = prior?.result.reward || awarded.reward;
      await attemptStore.put(
        { result: { ...clean, reward }, recordings },
        result.id,
      );
      await tx.objectStore("progress").put(awarded.progress, "profile");
      const recent = [
        { ...clean, answers: {} },
        ...readHistory().filter((x) => x.id !== result.id),
      ].slice(0, 10);
      const retained = new Set(recent.map((x) => x.id));
      for (const key of await attemptStore.getAllKeys())
        if (!retained.has(key)) await attemptStore.delete(key);
      await tx.done;
      db.close();
      localStorage.setItem(indexKey, JSON.stringify(recent));
      return {
        history: recent,
        progress: awarded.progress,
        reward: awarded.reward,
      };
    });
  queue = operation;
  return operation;
}
export async function loadAttempt(id: string): Promise<Result> {
  await queue.catch(() => {});
  const db = await database();
  const saved = await db.get("attempts", id);
  db.close();
  if (!saved)
    throw new Error(
      "This attempt is no longer available. Browser storage may have been cleared.",
    );
  const result: Result = resultSchema.parse(saved.result);
  for (const [qid, blob] of Object.entries(saved.recordings))
    result.answers[qid] = {
      ...result.answers[qid],
      recording: URL.createObjectURL(blob),
    };
  return result;
}
export function clearHistory() {
  const operation = queue
    .catch(() => {})
    .then(async () => {
      const db = await database();
      const tx = db.transaction(["attempts", "progress"], "readwrite");
      await tx.objectStore("attempts").clear();
      await tx.objectStore("progress").clear();
      await tx.done;
      db.close();
      localStorage.removeItem(indexKey);
    });
  queue = operation;
  return operation;
}

// Use the same queue as save/clear so a late model result cannot recreate a
// cleared or pruned attempt, or replace another question's saved response.
export function saveTranscription(
  attemptId: string,
  questionId: string,
  value: Transcription,
) {
  return saveSpeechResult(attemptId, questionId, {
    transcription: transcriptionSchema.parse(value),
  });
}
export function savePronunciation(
  attemptId: string,
  questionId: string,
  value: Pronunciation,
) {
  return saveSpeechResult(attemptId, questionId, {
    pronunciation: pronunciationSchema.parse(value),
  });
}
function saveSpeechResult(
  attemptId: string,
  questionId: string,
  value: { transcription?: Transcription; pronunciation?: Pronunciation },
) {
  const operation = queue
    .catch(() => {})
    .then(async () => {
      const db = await database();
      try {
        const tx = db.transaction("attempts", "readwrite");
        const saved = await tx.store.get(attemptId);
        if (
          !saved ||
          !saved.result.questionIds.includes(questionId) ||
          !saved.recordings[questionId]
        ) {
          await tx.done;
          return false;
        }
        saved.result.answers[questionId] = {
          ...saved.result.answers[questionId],
          ...value,
        };
        await tx.store.put(saved, attemptId);
        await tx.done;
        return true;
      } finally {
        db.close();
      }
    });
  queue = operation;
  return operation;
}

export async function loadProgress(): Promise<Progress> {
  await queue.catch(() => {});
  const db = await database();
  try {
    const parsed = progressSchema.safeParse(
      await db.get("progress", "profile"),
    );
    return parsed.success ? parsed.data : emptyProgress();
  } finally {
    db.close();
  }
}
