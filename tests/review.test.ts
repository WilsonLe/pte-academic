import { test } from "node:test";
import assert from "node:assert/strict";
import { answerMatches, guideFor, guides, questions } from "../src/content";
import { exampleLabel, promptBlocks } from "../src/review-content";
import { reviewItems } from "../src/review-diff";

test("every current question has item feedback and a complete response/source path", () => {
  const types = new Set<string>();
  for (const q of questions) {
    types.add(q.type);
    const kind = guideFor(q).kind;
    assert.ok(q.explanation.trim(), q.id);
    const prompt = promptBlocks(q).map((b) => b.text);
    for (const text of [
      q.prompt,
      ["dropdown", "bank", "blanks"].includes(kind) ? undefined : q.text,
      q.audioText,
    ].filter(Boolean))
      assert.ok(prompt.includes(text!), `${q.id}: source missing`);
    assert.equal(
      new Set(prompt).size,
      prompt.length,
      `${q.id}: duplicate source`,
    );
    assert.ok(reviewItems(q, {}).length, q.id);
    if (kind !== "write" && kind !== "speak") {
      const answer = q.answers ? { values: q.answers } : { text: q.model };
      assert.ok(answerMatches(q, answer), `${q.id}: accepted key`);
      assert.ok(!answerMatches(q, {}), `${q.id}: empty must not match`);
    }
  }
  assert.deepEqual([...types].sort(), guides.map((g) => g.id).sort());
});

test("open responses retain alternative example and outline labels", () => {
  assert.equal(
    exampleLabel(questions.find((q) => q.type === "write-essay")!),
    "Planning outline",
  );
  assert.equal(
    exampleLabel(questions.find((q) => q.type === "summarize-written-text")!),
    "Example response",
  );
  assert.equal(
    exampleLabel(questions.find((q) => q.type === "answer-short-question")!),
    "Expected answer",
  );
});
