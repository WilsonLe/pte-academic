import { test } from "node:test";
import assert from "node:assert/strict";
import { readingBoundary } from "../src/reading-boundary";

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
