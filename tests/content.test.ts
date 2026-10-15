import { test } from "node:test";
import assert from "node:assert/strict";
import { validateContent } from "../scripts/validate-content";
import {
  feedback,
  questions,
  wordCount,
  normalize,
  mocks,
  guides,
} from "../src/content";
test("complete content graph, unique original mock, and local assets validate", () => {
  assert.match(validateContent(), /65 original questions/);
  assert.equal(mocks[0].questionIds.length, 65);
  assert.equal(guides.length, 22);
});
test("multiple-answer penalty cannot be improved by selecting all options", () => {
  const q = questions.find((q) => q.type === "reading-multiple")!;
  assert.equal(feedback(q, { values: ["0", "1"] }).label, "Correct");
  assert.match(feedback(q, { values: ["0", "1", "2", "3"] }).detail, /0\/2/);
});
test("reordering rewards adjacent pairs rather than a correct first paragraph", () => {
  const q = questions.find((q) => q.type === "reorder-paragraphs")!;
  assert.match(feedback(q, { values: ["1", "0", "3", "2"] }).detail, /0\/3/);
  assert.match(feedback(q, { values: q.answers }).detail, /3\/3/);
});
test("blank feedback is position-sensitive and dictation ignores punctuation only", () => {
  const q = questions.find((q) => q.type === "reading-dropdown")!;
  assert.equal(feedback(q, { values: q.answers }).label, "Correct");
  assert.equal(
    feedback(q, { values: [...q.answers!].reverse() }).label,
    "Review answer",
  );
  const d = questions.find((q) => q.type === "write-dictation")!;
  assert.equal(
    feedback(d, { text: d.model?.toUpperCase() }).label,
    "Exact match",
  );
  assert.equal(feedback(d, { text: "The results" }).label, "Compare sentence");
});
test("writing gives word-count guidance without assigning proficiency scores", () => {
  assert.equal(wordCount("  a   useful\nsummary "), 3);
  assert.equal(normalize("Hello, world!"), "hello world");
  const q = questions.find((q) => q.type === "summarize-written-text")!;
  assert.match(feedback(q, { text: "Too short" }).detail, /2 words/);
  assert.equal(feedback(q, { text: q.model }).label, "Self-review");
});
