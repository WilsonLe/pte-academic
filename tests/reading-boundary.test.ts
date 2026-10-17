import { test } from "node:test";
import assert from "node:assert/strict";
import { readingBoundary } from "../src/reading-boundary";
import questions from "../content/questions.json" with { type: "json" };

test("speaker cues stay with their following remarks rather than the previous sentence", () => {
  const previous = "The first point is complete.";
  for (const cue of ["Speaker one.", "Speaker two.", "Speaker three."]) {
    const text = `${previous} ${cue} I disagree because the proposal needs more evidence.`;
    assert.equal(
      readingBoundary(text, previous.length + cue.length + 8),
      previous.length,
    );
  }
});

test("both discussion transcripts preserve all text without cue-only page endings", () => {
  for (const question of questions.filter(
    (q) => q.type === "summarize-group-discussion",
  )) {
    for (const limit of [64, 120, 180]) {
      let rest = question.audioText!;
      const parts: string[] = [];
      while (rest) {
        const end = readingBoundary(rest, Math.min(limit, rest.length));
        assert.ok(end > 0 && end <= limit);
        const part = rest.slice(0, end);
        assert.doesNotMatch(part.trim(), /\bSpeaker (?:one|two|three)\.$/);
        parts.push(part);
        rest = rest.slice(end);
      }
      assert.equal(parts.join(""), question.audioText);
    }
  }
});

test("numbered paragraphs stay intact when a later line only partly fits", () => {
  const first = "1. A library started a seed-sharing scheme.";
  const second = "2. Residents borrowed seeds and grew vegetables at home.";
  const text = `${first}\n${second}\n3. They returned new seeds.`;
  assert.equal(readingBoundary(text, first.length + 25), first.length);
  assert.equal(
    readingBoundary(text, first.length + second.length + 10),
    first.length + 1 + second.length,
  );
});

test("prose breaks after a sentence rather than inside the next phrase", () => {
  const first = "Harvesting comes next.";
  const text = `${first} “This cycle” refers to returning seeds.`;
  assert.equal(readingBoundary(text, first.length + 8), first.length);
});

test("an oversized numbered paragraph can split at a sentence without orphaning its number", () => {
  const text =
    "1. Seeds were borrowed. Residents grew vegetables and returned seeds.";
  assert.equal(readingBoundary(text, 30), "1. Seeds were borrowed.".length);
  assert.notEqual(readingBoundary(text, 12), 2);
});

test("oversized sentences and unbroken tokens retain every character", () => {
  for (const text of [
    "A very long sentence without a convenient full stop until its very end.",
    "abcdefghijklmnopqrstuvwxyz".repeat(3),
    "One paragraph.\n2. Another unusually long paragraph with punctuation, ‘quotes’ and case.",
  ]) {
    let rest = text;
    const parts = [];
    while (rest) {
      const end = readingBoundary(rest, Math.min(17, rest.length));
      assert.ok(end > 0 && end <= 17);
      parts.push(rest.slice(0, end));
      rest = rest.slice(end);
    }
    assert.equal(parts.join(""), text);
  }
});
