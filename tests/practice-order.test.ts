import { test } from "node:test";
import assert from "node:assert/strict";
import { questions, guideFor, mocks } from "../src/content";
import { shuffled, variedPracticeOrder } from "../src/practice-order";
import { emptyProgress, questQuestions, awardPractice } from "../src/progress";

const order = mocks[0].questionIds.map((id) =>
  questions.find((q) => q.id === id)!,
);
const ids = (items: typeof order) => items.map((q) => q.id);

test("shuffle varies variants without changing authored input, task slots, references or counts", () => {
  const before = ids(order);
  const next = variedPracticeOrder(Object.freeze([...order]), [], () => 0);
  assert.notDeepEqual(ids(next), before);
  assert.deepEqual(ids(next).sort(), [...before].sort());
  assert.equal(new Set(ids(next)).size, order.length);
  assert.deepEqual(
    next.map((q) => q.type),
    order.map((q) => q.type),
  );
  assert.deepEqual(
    next.map((q) => guideFor(q).section),
    order.map((q) => guideFor(q).section),
  );
  assert.ok(
    next.every((q) => questions.find((source) => source.id === q.id) === q),
  );
  assert.deepEqual(ids(order), before);
});

test("a fresh retake avoids the last saved opener for every type with alternatives", () => {
  for (const type of new Set(order.map((q) => q.type))) {
    const pool = order.filter((q) => q.type === type);
    const first = variedPracticeOrder(pool, [], () => 0.999999);
    const second = variedPracticeOrder(
      pool,
      [{ questionIds: ids(first) }],
      () => 0.999999,
    );
    assert.deepEqual(ids(second).sort(), ids(first).sort());
    if (pool.length > 1) assert.notEqual(second[0].id, first[0].id);
    else assert.equal(second[0].id, first[0].id);
  }
});

test("section and mock retakes avoid each latest matching task opener without reordering task stages", () => {
  const next = variedPracticeOrder(
    order,
    [{ questionIds: ids(order) }],
    () => 0.999999,
  );
  for (const type of new Set(order.map((q) => q.type))) {
    const before = order.filter((q) => q.type === type);
    const after = next.filter((q) => q.type === type);
    if (before.length > 1) assert.notEqual(after[0].id, before[0].id);
  }
  assert.deepEqual(
    next.map((q) => q.type),
    order.map((q) => q.type),
  );
  assert.deepEqual(
    shuffled([], () => 0),
    [],
  );
  assert.deepEqual(
    shuffled(["only"], () => 0),
    ["only"],
  );
});

test("daily selection varies openers, preserves type variety and excludes answered-today items", () => {
  const day = "2026-10-18";
  const first = questQuestions(emptyProgress(), day, [], () => 0.999999);
  const second = questQuestions(
    emptyProgress(),
    day,
    [{ questionIds: ids(first) }],
    () => 0.999999,
  );
  assert.equal(first.length, 3);
  assert.equal(new Set(first.map((q) => q.type)).size, 3);
  assert.notEqual(first[0].id, second[0].id);
  const progress = awardPractice(
    emptyProgress(),
    {
      id: "one",
      label: "Daily practice",
      date: day,
      finished: true,
      questionIds: [first[0].id],
      answers: { [first[0].id]: { values: ["0"] } },
    },
    day,
  ).progress;
  const remaining = questQuestions(
    progress,
    day,
    [{ questionIds: ids(first) }],
    () => 0,
  );
  assert.equal(remaining.length, 2);
  assert.ok(
    remaining.every(
      (q) => q.id !== first[0].id && guideFor(q).section === "reading",
    ),
  );
});
