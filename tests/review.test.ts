import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answerMatches,
  feedback,
  guideFor,
  guides,
  questions,
} from "../src/content";
import {
  exampleLabel,
  feedbackBlocks,
  promptBlocks,
  responseBlocks,
} from "../src/review-content";
const question = (type: string) => questions.find((q) => q.type === type)!;

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
    assert.ok(responseBlocks(q, {}).length, q.id);
    assert.ok(
      feedbackBlocks(q, {}).some((b) => b.text.includes(q.explanation)),
      q.id,
    );
    if (kind !== "write" && kind !== "speak") {
      const answer = q.answers ? { values: q.answers } : { text: q.model };
      assert.ok(answerMatches(q, answer), `${q.id}: accepted key`);
      assert.ok(!answerMatches(q, {}), `${q.id}: empty must not match`);
    }
  }
  assert.deepEqual([...types].sort(), guides.map((g) => g.id).sort());
});

test("choice review identifies selected errors and missed correct options", () => {
  const q = question("reading-multiple");
  const blocks = responseBlocks(q, { values: ["0", "2"] });
  assert.match(blocks[0].label!, /Selected · Correct/);
  assert.match(blocks[1].label!, /Correct answer · Not selected/);
  assert.match(blocks[2].label!, /Selected · Incorrect/);
  assert.match(blocks[3].label!, /Not selected/);
  assert.match(
    feedback(q, { values: ["0", "2"] }).detail,
    /1 correct selection, 1 incorrect, 1 missed/,
  );
  assert.match(
    feedback(q, { values: ["0", "0"] }).detail,
    /1 correct selection/,
  );
  assert.equal(answerMatches(q, { values: ["0", "0"] }), false);
});

test("gap comparisons preserve unanswered positions and show only differing keys", () => {
  for (const type of [
    "reading-dropdown",
    "reading-blanks",
    "listening-blanks",
  ]) {
    const q = question(type);
    const blocks = responseBlocks(q, { values: ["", q.answers![1]] });
    assert.match(blocks[0].label!, /Gap 1 · Unanswered/);
    assert.ok(blocks[0].text.includes(q.answers![0]));
    assert.match(blocks[1].label!, /Gap 2 · Correct/);
    assert.ok(!blocks[1].text.includes("Answer key"));
    assert.match(
      feedback(q, { values: ["", q.answers![1]] }).detail,
      /1\/2 gaps correct/,
    );
  }
});

test("ordering keeps paragraph boundaries and counts only completed adjacent pairs", () => {
  const q = question("reorder-paragraphs");
  const blocks = responseBlocks(q, { values: q.answers!.slice(0, 2) });
  assert.equal(blocks[0].text.split("\n").length, 2);
  assert.equal(blocks[1].text.split("\n").length, 4);
  assert.match(feedback(q, { values: q.answers!.slice(0, 2) }).detail, /1\/3/);
  assert.equal(responseBlocks(q, { values: q.answers }).length, 1);
});

test("highlight review names a word position and the actual spoken replacement", () => {
  const q = question("highlight-incorrect");
  const blocks = responseBlocks(q, { values: ["0"] });
  assert.equal(blocks.length, 2);
  assert.match(blocks[0].label!, /Word 1 · Selected · Incorrect/);
  assert.match(blocks[1].label!, /Word 10 · Missed/);
  assert.match(blocks[1].text, /Written: quickly\.\nHeard: carefully\./);
});

test("writing examples are alternatives; an essay has an outline, not an answer key", () => {
  const q = question("summarize-written-text");
  assert.equal(exampleLabel(q), "Example response");
  assert.equal(responseBlocks(q, { text: q.model }).length, 2);
  assert.match(
    feedback(q, { text: "One word." }).detail,
    /3 below the minimum/,
  );
  assert.match(
    feedback(q, { text: "x ".repeat(76) }).detail,
    /1 above the maximum/,
  );
  assert.equal(exampleLabel(question("write-essay")), "Planning outline");
  assert.equal(feedback(q, {}).label, "No response");
});

test("dictation avoids duplicate matching keys but retains spelling and order differences", () => {
  const q = question("write-dictation");
  assert.equal(responseBlocks(q, { text: q.model!.toUpperCase() }).length, 1);
  assert.equal(responseBlocks(q, { text: "The results" }).length, 2);
  assert.equal(feedback(q, {}).label, "No response");
  assert.equal(
    answerMatches(q, { text: q.model!.split(" ").reverse().join(" ") }),
    false,
  );
});
