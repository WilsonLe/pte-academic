import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  saveAttempt,
  loadAttempt,
  saveTranscription,
  clearHistory,
  readHistory,
} from "../src/storage";
import type { Result } from "../src/Runner";
const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  },
});
const transcript = {
  text: "The library is open.",
  seconds: 3,
  model: "onnx-community/whisper-tiny.en",
  revision: "2575352d61be1bf7225cf8f8b268a4678025fc58",
  engine: "transformers.js-4.3.1/whisper-q8-wasm",
};
const url = URL.createObjectURL(
  new Blob(["local recording"], { type: "audio/webm" }),
);
const attempt = (id: string): Result => ({
  id,
  label: "Speech",
  date: new Date().toISOString(),
  questionIds: ["read-aloud-01", "read-aloud-02"],
  answers: {
    "read-aloud-01": { recording: url },
    "read-aloud-02": { recording: url, text: "unchanged" },
  },
  finished: true,
});
test("derived transcript persists with recordings, reads legacy attempts, and stays out of localStorage", async () => {
  await clearHistory();
  await saveAttempt(attempt("one"));
  const before = await loadAttempt("one");
  assert.equal(before.answers["read-aloud-01"].transcription, undefined);
  URL.revokeObjectURL(before.answers["read-aloud-01"].recording!);
  URL.revokeObjectURL(before.answers["read-aloud-02"].recording!);
  assert.equal(
    await saveTranscription("one", "read-aloud-01", transcript),
    true,
  );
  const after = await loadAttempt("one");
  assert.deepEqual(after.answers["read-aloud-01"].transcription, transcript);
  assert.equal(after.answers["read-aloud-02"].text, "unchanged");
  assert.equal(
    (await fetch(after.answers["read-aloud-01"].recording!)).status,
    200,
  );
  assert.equal(
    values.get("pte-studio-history-v1")!.includes("transcription"),
    false,
  );
  assert.equal(
    await saveTranscription("one", "repeat-sentence-01", transcript),
    false,
  );
  Object.values(after.answers).forEach(
    (a) => a.recording && URL.revokeObjectURL(a.recording),
  );
});
test("late transcript writes cannot resurrect a cleared or pruned attempt", async () => {
  await clearHistory();
  await saveAttempt(attempt("clear-me"));
  const clear = clearHistory(),
    late = saveTranscription("clear-me", "read-aloud-01", transcript);
  await clear;
  assert.equal(await late, false);
  assert.equal(readHistory().length, 0);
  await assert.rejects(loadAttempt("clear-me"));
  await saveAttempt(attempt("prune-me"));
  for (let i = 0; i < 10; i++) await saveAttempt(attempt("keep-" + i));
  assert.equal(
    await saveTranscription("prune-me", "read-aloud-01", transcript),
    false,
  );
  assert.equal(readHistory().length, 10);
  await assert.rejects(loadAttempt("prune-me"));
  await clearHistory();
});
