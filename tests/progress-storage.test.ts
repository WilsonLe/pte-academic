import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadAttempt,
  saveAttempt,
  loadProgress,
  clearHistory,
} from "../src/storage";
import type { Result } from "../src/Runner";
const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, v: string) => values.set(key, v),
    removeItem: (key: string) => values.delete(key),
  },
});
const attempt = (id: string, q = "reading-single-01"): Result => ({
  id,
  label: "Old practice",
  date: new Date().toISOString(),
  questionIds: [q],
  answers: { [q]: { values: ["0"] } },
  finished: true,
});
test("v1 database upgrades without losing attempts and progress commits atomically/idempotently", async () => {
  const old = attempt("legacy", "read-aloud-01");
  old.answers["read-aloud-01"].transcription = {
    text: "Legacy words",
    seconds: 2,
    engine: "legacy-local",
    model: "whisper",
    revision: "old",
  };
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.open("pte-studio", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("attempts");
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const db = r.result,
        tx = db.transaction("attempts", "readwrite");
      tx.objectStore("attempts").put(
        {
          result: old,
          recordings: {
            "read-aloud-01": new Blob(["legacy recording"], {
              type: "audio/webm",
            }),
          },
        },
        "legacy",
      );
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    };
  });
  assert.equal((await loadProgress()).xp, 0);
  const migrated = await loadAttempt("legacy");
  assert.deepEqual(
    migrated.answers["read-aloud-01"].transcription,
    old.answers["read-aloud-01"].transcription,
  );
  assert.equal(
    await (await fetch(migrated.answers["read-aloud-01"].recording!)).text(),
    "legacy recording",
  );
  URL.revokeObjectURL(migrated.answers["read-aloud-01"].recording!);
  const first = await saveAttempt(attempt("new"));
  assert.equal(first.reward.xp, 10);
  assert.equal((await loadProgress()).xp, 10);
  const again = await saveAttempt(attempt("new", "reading-single-02"));
  assert.equal(again.reward.xp, 0);
  assert.equal((await loadProgress()).xp, 10);
  const saves = await Promise.all([
    saveAttempt(attempt("next", "reading-dropdown-01")),
    saveAttempt(attempt("next2", "reorder-paragraphs-01")),
  ]);
  assert.equal(saves[1].progress.xp, 60);
  assert.equal((await loadProgress()).xp, 60);
  assert.equal(values.get("pte-studio-history-v1")!.includes("values"), false);
  for (let i = 0; i < 11; i++) await saveAttempt(attempt("prune-" + i));
  assert.equal((await loadProgress()).xp, 60);
  await clearHistory();
  assert.equal((await loadProgress()).xp, 0);
  await assert.rejects(loadAttempt("new"));
});
test("a save after midnight credits the question completion day", async () => {
  await clearHistory();
  const result = attempt("midnight");
  result.date = new Date(2025, 11, 31, 23, 59, 59).toISOString();
  await saveAttempt(result);
  assert.equal((await loadProgress()).lastDay, "2025-12-31");
  await clearHistory();
});

test("review effort commits once per target/day, survives retention and cannot recreate cleared/pruned attempts", async () => {
  const { saveReviewReward } = await import("../src/storage");
  const { awardReview, emptyProgress } = await import("../src/progress");
  const { COMPARISON_MODEL_SHA, COMPARISON_EXPORT } =
    await import("../src/speech/comparison-schema");
  await clearHistory();
  await saveAttempt(attempt("review", "read-aloud-01"));
  const result: import("../src/speech/comparison-schema").Pronunciation = {
    schemaVersion: 1 as const,
    modelSha256: COMPARISON_MODEL_SHA,
    exportId: COMPARISON_EXPORT,
    referenceAccents: ["en-US", "en-GB", "en-AU", "en-IN"] as [
      "en-US",
      "en-GB",
      "en-AU",
      "en-IN",
    ],
    seconds: 1,
    status: "unscored" as const,
    syllables: [
      {
        word: "urban",
        wordIndex: 0,
        syllableIndex: 0,
        label: "ɜː",
        start: 0,
        end: 0.5,
        similarity: null,
        confidence: 0,
        status: "uncertain" as const,
      },
    ],
  };
  const input = {
    attemptId: "review",
    questionId: "read-aloud-01",
    wordIndex: 0,
    syllableIndex: 0,
    result,
  };
  const before = await loadProgress();
  const completed = await Promise.all([
    saveReviewReward(input),
    saveReviewReward(input),
  ]);
  assert.deepEqual(
    completed.map((r) => r.xp),
    [5, 0],
  );
  const after = await loadProgress();
  assert.equal(after.xp, before.xp + 5);
  assert.deepEqual(after.days, before.days);
  assert.equal(after.streak, before.streak);
  assert.equal(
    (await loadAttempt("review")).answers["read-aloud-01"].pronunciation,
    undefined,
  );
  assert.ok(
    !localStorage.getItem("pte-studio-history-v1")!.includes("reviewed"),
  );
  const noSpeech = await saveReviewReward({
    ...input,
    result: { ...result, status: "no-reliable-speech", syllables: [] },
  });
  assert.equal(noSpeech.xp, 0);
  const fresh = awardReview(emptyProgress(), "target", "2026-10-16");
  assert.equal(awardReview(fresh.progress, "target", "2026-10-16").xp, 0);
  assert.equal(awardReview(fresh.progress, "target", "2026-10-17").xp, 5);
  for (let i = 0; i < 11; i++) await saveAttempt(attempt(`retained-${i}`));
  assert.equal((await saveReviewReward(input)).retained, false);
  assert.equal((await loadProgress()).xp, after.xp + 10);
  await clearHistory();
  assert.equal((await saveReviewReward(input)).xp, 0);
  assert.equal((await loadProgress()).xp, 0);
  await assert.rejects(loadAttempt("review"));
});
