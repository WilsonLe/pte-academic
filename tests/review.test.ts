import { test } from "node:test";
import assert from "node:assert/strict";
import { answerMatches, guideFor, guides, questions } from "../src/content";
import { exampleLabel, questionBlocks } from "../src/review-content";
import { reviewItems } from "../src/review-diff";

test("every current question has item feedback and a complete response/source path", () => {
  const types = new Set<string>();
  for (const q of questions) {
    types.add(q.type);
    const kind = guideFor(q).kind;
    assert.ok(q.explanation.trim(), q.id);
    const original = questionBlocks(q).map((b) => b.text);
    let gap = 0;
    const text =
      q.text?.replace(/\{\{\}\}/g, () => `[${++gap}]`) || q.audioText;
    if (text)
      assert.ok(original.includes(text), `${q.id}: original question missing`);
    if (kind === "order")
      for (const paragraph of q.options!)
        assert.ok(
          original.includes(paragraph),
          `${q.id}: original paragraph missing`,
        );
    if (kind === "bank") assert.ok(original.includes(q.options!.join(" · ")));
    for (const options of q.blankOptions || [])
      assert.ok(original.includes(options.join(" · ")));
    assert.ok(
      !original.includes(q.explanation),
      `${q.id}: rationale leaked into question`,
    );
    if (q.model && q.model !== q.text && q.model !== q.audioText)
      assert.ok(
        !original.includes(q.model),
        `${q.id}: alternative leaked into question`,
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
