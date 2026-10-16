import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  saveAttempt,
  savePronunciation,
  loadAttempt,
  clearHistory,
  loadProgress,
} from "../src/storage";
import {
  COMPARISON_EXPORT,
  COMPARISON_MODEL_SHA,
  type Pronunciation,
} from "../src/speech/comparison-schema";
import type { Result } from "../src/Runner";
const local = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => local.get(k) ?? null,
    setItem: (k: string, v: string) => local.set(k, v),
    removeItem: (k: string) => local.delete(k),
  },
});
const recording = URL.createObjectURL(new Blob(["local audio"]));
const attempt = (id: string): Result => ({
  id,
  label: "Speech",
  date: new Date().toISOString(),
  questionIds: ["read-aloud-01"],
  answers: { "read-aloud-01": { recording } },
  finished: true,
});
const score: Pronunciation = {
  schemaVersion: 1,
  modelSha256: COMPARISON_MODEL_SHA,
  exportId: COMPARISON_EXPORT,
  referenceAccents: ["en-US", "en-GB", "en-AU", "en-IN"],
  seconds: 1,
  status: "scored",
  syllables: [
    {
      word: "test",
      wordIndex: 0,
      syllableIndex: 0,
      label: "t ɛ0 s t",
      start: 0,
      end: 1,
      confidence: 0.4,
      similarity: 81,
      status: "scored",
    },
  ],
};
test("v3 grades persist with retained recordings, never enter the index and never award XP", async () => {
  await clearHistory();
  await saveAttempt(attempt("grade"));
  const progress = await loadProgress();
  assert.equal(await savePronunciation("grade", "read-aloud-01", score), true);
  const loaded = await loadAttempt("grade");
  assert.deepEqual(loaded.answers["read-aloud-01"].pronunciation, score);
  assert.equal([...local.values()].join("").includes("pronunciation"), false);
  assert.deepEqual(await loadProgress(), progress);
  URL.revokeObjectURL(loaded.answers["read-aloud-01"].recording!);
});
test("late grades cannot recreate cleared or pruned attempts or attach to another question", async () => {
  await clearHistory();
  await saveAttempt(attempt("old"));
  assert.equal(await savePronunciation("old", "read-aloud-02", score), false);
  for (let i = 0; i < 10; i++) await saveAttempt(attempt("new-" + i));
  assert.equal(await savePronunciation("old", "read-aloud-01", score), false);
  await clearHistory();
  assert.equal(await savePronunciation("new-9", "read-aloud-01", score), false);
  await assert.rejects(() => loadAttempt("new-9"));
});
