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
test("multiple-answer review exposes incorrect extra selections", () => {
  const q = questions.find((q) => q.type === "reading-multiple")!;
  assert.equal(feedback(q, { values: ["0", "1"] }).label, "Correct");
  assert.match(
    feedback(q, { values: ["0", "1", "2", "3"] }).detail,
    /2 correct selections, 2 incorrect/,
  );
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

test("guide timing annotations agree with the complete authored phase allowances", () => {
  const cases = [
    {
      id: "describe-image",
      phases: { preparation: 25 },
      text: /Study the image for 25 seconds/,
    },
    {
      id: "retell-lecture",
      phases: { preparation: 10 },
      text: /10 seconds of preparation/,
    },
    {
      id: "summarize-group-discussion",
      phases: { preparation: 10, response: 120 },
      text: /Prepare for 10 seconds.*up to two minutes/,
    },
    {
      id: "respond-to-situation",
      phases: { preparation: 10 },
      text: /After 10 seconds, speak/,
    },
    {
      id: "summarize-written-text",
      phases: { response: 600 },
      text: /You have 10 minutes/,
    },
    {
      id: "write-essay",
      phases: { response: 1200 },
      text: /You have 20 minutes, including planning and checking/,
    },
    {
      id: "summarize-spoken-text",
      phases: { response: 600 },
      text: /10 minutes include listening and writing/,
    },
  ];
  assert.deepEqual(
    guides
      .filter((g) => g.timingInInstructions)
      .map((g) => g.id)
      .sort(),
    cases.map((c) => c.id).sort(),
  );
  for (const c of cases) {
    const guide = guides.find((g) => g.id === c.id)!;
    assert.match(guide.instructions, c.text);
    assert.deepEqual(
      guide.timingInInstructions,
      Object.fromEntries(Object.keys(c.phases).map((phase) => [phase, true])),
    );
    for (const [phase, seconds] of Object.entries(c.phases)) {
      assert.equal(
        phase === "preparation" ? guide.prepSeconds : guide.answerSeconds,
        seconds,
      );
    }
  }
});
