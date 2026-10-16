import "fake-indexeddb/auto";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MutationObserver, onlineManager } from "@tanstack/react-query";
import {
  createLocalQueryClient,
  historyQuery,
  progressQuery,
  localKeys,
  saveAttemptMutation,
  clearHistoryMutation,
} from "../src/queries";
import {
  clearHistory,
  loadProgress,
  readHistory,
  saveAttempt,
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
const attempt = (id: string): Result => ({
  id,
  label: "Local query practice",
  date: new Date().toISOString(),
  questionIds: ["reading-single-01"],
  answers: { "reading-single-01": { values: ["0"] } },
  finished: true,
});
afterEach(() => onlineManager.setOnline(true));

test("local queries and save/clear mutations work while offline, without duplicating rewards", async () => {
  await clearHistory();
  const client = createLocalQueryClient();
  onlineManager.setOnline(false);
  try {
    assert.deepEqual(await client.fetchQuery(historyQuery()), []);
    assert.equal((await client.fetchQuery(progressQuery())).xp, 0);
    const save = new MutationObserver(client, saveAttemptMutation(client));
    const result = await save.mutate(attempt("offline"));
    assert.equal(result.reward.xp, 10);
    assert.equal(
      client.getQueryData<ReturnType<typeof readHistory>>(
        localKeys.history,
      )?.[0].id,
      "offline",
    );
    assert.equal(
      client.getQueryData<Awaited<ReturnType<typeof loadProgress>>>(
        localKeys.progress,
      )?.xp,
      10,
    );
    await save.mutate(attempt("offline"));
    assert.equal((await client.fetchQuery(progressQuery())).xp, 10);
    const clear = new MutationObserver(client, clearHistoryMutation(client));
    await clear.mutate();
    assert.deepEqual(client.getQueryData(localKeys.history), []);
    assert.equal((await client.fetchQuery(progressQuery())).xp, 0);
    assert.deepEqual(await client.fetchQuery(historyQuery()), []);
    save.reset();
    clear.reset();
  } finally {
    client.clear();
  }
});

test("late reads cannot restore stale cached history or XP after a clear", async () => {
  await clearHistory();
  const client = createLocalQueryClient();
  try {
    const save = new MutationObserver(client, saveAttemptMutation(client));
    const saved = await save.mutate(attempt("before-clear"));
    let finishHistory!: (value: typeof saved.history) => void;
    let finishProgress!: (value: typeof saved.progress) => void;
    const historyRead = client
      .fetchQuery({
        ...historyQuery(),
        queryFn: () =>
          new Promise<typeof saved.history>((resolve) => {
            finishHistory = resolve;
          }),
      })
      .catch(() => {});
    const progressRead = client
      .fetchQuery({
        ...progressQuery(),
        queryFn: () =>
          new Promise<typeof saved.progress>((resolve) => {
            finishProgress = resolve;
          }),
      })
      .catch(() => {});
    const clear = new MutationObserver(client, clearHistoryMutation(client));
    await clear.mutate();
    finishHistory(saved.history);
    finishProgress(saved.progress);
    await Promise.all([historyRead, progressRead]);
    assert.deepEqual(client.getQueryData(localKeys.history), []);
    assert.equal(
      client.getQueryData<typeof saved.progress>(localKeys.progress)?.xp,
      0,
    );
    assert.deepEqual(readHistory(), []);
    assert.equal((await loadProgress()).xp, 0);
    save.reset();
    clear.reset();
  } finally {
    client.clear();
  }
});

test("invalid saves fail once and leave published local query snapshots unchanged", async () => {
  await clearHistory();
  const client = createLocalQueryClient();
  try {
    await client.fetchQuery(historyQuery());
    await client.fetchQuery(progressQuery());
    const options = saveAttemptMutation(client);
    let calls = 0;
    const save = new MutationObserver(client, {
      ...options,
      mutationFn: (value: Result) => {
        calls++;
        return saveAttempt(value);
      },
    });
    const invalid = {
      ...attempt("invalid"),
      questionIds: ["unknown-question"],
    };
    await assert.rejects(save.mutate(invalid));
    assert.equal(calls, 1);
    assert.deepEqual(client.getQueryData(localKeys.history), []);
    assert.equal(
      client.getQueryData<Awaited<ReturnType<typeof loadProgress>>>(
        localKeys.progress,
      )?.xp,
      0,
    );
    assert.deepEqual(readHistory(), []);
    save.reset();
  } finally {
    client.clear();
  }
});

test("offline review reward publishes its committed profile and cancels older reads", async () => {
  const { reviewRewardMutation } = await import("../src/queries");
  const { COMPARISON_MODEL_SHA, COMPARISON_EXPORT } =
    await import("../src/speech/comparison-schema");
  await clearHistory();
  const client = createLocalQueryClient();
  const saved = await saveAttempt({
    ...attempt("review-query"),
    questionIds: ["read-aloud-01"],
    answers: { "read-aloud-01": { text: "response evidence" } },
  });
  let finish!: (value: typeof saved.progress) => void;
  const pending = client
    .fetchQuery({
      ...progressQuery(),
      queryFn: () =>
        new Promise<typeof saved.progress>((resolve) => {
          finish = resolve;
        }),
    })
    .catch(() => {});
  onlineManager.setOnline(false);
  const mutation = new MutationObserver(client, reviewRewardMutation(client));
  try {
    const result = await mutation.mutate({
      attemptId: "review-query",
      questionId: "read-aloud-01",
      wordIndex: 0,
      syllableIndex: 0,
      result: {
        schemaVersion: 1,
        modelSha256: COMPARISON_MODEL_SHA,
        exportId: COMPARISON_EXPORT,
        referenceAccents: ["en-US", "en-GB", "en-AU", "en-IN"],
        seconds: 1,
        status: "scored",
        syllables: [
          {
            word: "urban",
            wordIndex: 0,
            syllableIndex: 0,
            label: "ɜː",
            start: 0,
            end: 1,
            similarity: 30,
            confidence: 0.5,
            status: "scored",
          },
        ],
      },
    });
    finish(saved.progress);
    await pending;
    assert.equal(result.xp, 5);
    assert.equal(
      client.getQueryData<typeof saved.progress>(localKeys.progress)?.xp,
      saved.progress.xp + 5,
    );
    mutation.reset();
  } finally {
    client.clear();
  }
});
