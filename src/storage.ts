import { openDB, type DBSchema } from "idb";
import { z } from "zod";
import type { Result } from "./Runner";
import { questions } from "./content";
const indexKey = "pte-studio-history-v1";
const answerSchema = z.object({
  text: z.string().optional(),
  values: z.array(z.string()).optional(),
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
});
interface AttemptStore extends DBSchema {
  attempts: {
    key: string;
    value: { result: Result; recordings: Record<string, Blob> };
  };
}
let queue: Promise<unknown> = Promise.resolve();
const database = () =>
  openDB<AttemptStore>("pte-studio", 1, {
    upgrade(db) {
      db.createObjectStore("attempts");
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
            { text: a.text, values: a.values },
          ]),
        ),
      });
      const db = await database();
      const tx = db.transaction("attempts", "readwrite");
      await tx.store.put({ result: clean, recordings }, result.id);
      const recent = [
        { ...clean, answers: {} },
        ...readHistory().filter((x) => x.id !== result.id),
      ].slice(0, 10);
      const retained = new Set(recent.map((x) => x.id));
      for (const key of await tx.store.getAllKeys())
        if (!retained.has(key)) await tx.store.delete(key);
      await tx.done;
      db.close();
      localStorage.setItem(indexKey, JSON.stringify(recent));
      return recent;
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
      await db.clear("attempts");
      db.close();
      localStorage.removeItem(indexKey);
    });
  queue = operation;
  return operation;
}
