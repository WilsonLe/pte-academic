import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  syllableLetters,
  similarityTone,
  syllableDescription,
} from "../src/speech/syllable-display";
import type { Pronunciation } from "../src/speech/comparison-schema";
type Syllable = Pronunciation["syllables"][number];
const syllable = (
  word: string,
  syllableIndex: number,
  similarity: number | null,
  label = "",
): Syllable => ({
  word,
  wordIndex: 0,
  syllableIndex,
  similarity,
  label,
  start: 0,
  end: 1,
  confidence: similarity === null ? 0 : 0.8,
  status: similarity === null ? "uncertain" : "scored",
});
test("original spelling, capitalization, contractions and punctuation survive score colouring", () => {
  const values = [syllable("urban", 0, 80), syllable("urban", 1, 20)];
  const parts = syllableLetters("Urban,", values);
  assert.deepEqual(
    parts.map((p) => p.text),
    ["Ur", "ban", ","],
  );
  assert.deepEqual(
    parts.map((p) => p.syllable?.similarity),
    [80, 20, undefined],
  );
  const contraction = syllableLetters("Classmate’s.", [
    syllable("classmate's", 0, null),
    syllable("classmate's", 1, 60),
  ]);
  assert.equal(contraction.map((p) => p.text).join(""), "Classmate’s.");
  assert.equal(contraction[0].syllable?.similarity, null);
});
test("green, yellow, red and neutral preserve existing thresholds and uncertainty", () => {
  assert.deepEqual([null, 0, 49.99, 50, 74.99, 75, 100].map(similarityTone), [
    "uncertain",
    "focus",
    "focus",
    "developing",
    "developing",
    "close",
    "close",
  ]);
  assert.equal(
    syllableDescription(syllable("urban", 0, null)),
    "Syllable 1: uncertain, no score",
  );
  assert.equal(
    syllableDescription(syllable("urban", 1, 50)),
    "Syllable 2: 50 out of 100",
  );
});
test("unsupported or malformed multi-syllable maps stay neutral rather than inventing boundaries", () => {
  assert.deepEqual(
    syllableLetters("Unknown!", [
      syllable("unknown", 0, 90),
      syllable("unknown", 1, 5),
    ]),
    [{ text: "Unknown!" }],
  );
  assert.deepEqual(
    syllableLetters("Urban", [
      syllable("urban", 1, 90),
      syllable("urban", 1, 5),
    ]),
    [{ text: "Urban" }],
  );
  assert.deepEqual(syllableLetters("Urban", []), [{ text: "Urban" }]);
});
test("every fixed-question pronunciation variant has complete, occurrence-specific letter coverage", () => {
  const metadata = JSON.parse(
    readFileSync("public/models/blended-english-v3/comparison.json", "utf8"),
  );
  const questions = JSON.parse(readFileSync("content/questions.json", "utf8"));
  for (const q of questions.filter((q: any) =>
    ["read-aloud", "repeat-sentence"].includes(q.type),
  )) {
    const text = q.text || q.audioText;
    const key = text
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .match(/[a-z]+(?:'[a-z]+)?/g)
      .join(" ");
    for (const variant of metadata.scripts[key]) {
      const words = new Map<number, Syllable[]>();
      for (const s of variant.syllables) {
        const items = words.get(s.wordIndex) || [];
        items.push({
          ...syllable(
            s.word,
            s.syllableIndex,
            s.syllableIndex % 2 ? 30 : 80,
            s.phonemes.join(" "),
          ),
          wordIndex: s.wordIndex,
        });
        words.set(s.wordIndex, items);
      }
      for (const [wordIndex, units] of words) {
        const parts = syllableLetters(units[0].word, units);
        assert.equal(
          parts.length,
          units.length,
          `${q.id}/${variant.language}/${units[0].word}`,
        );
        assert.equal(parts.map((p) => p.text).join(""), units[0].word);
        parts.forEach((p, i) =>
          assert.equal(p.syllable, units[i], `${q.id}/${wordIndex}/${i}`),
        );
      }
    }
  }
});

test("same-count pronunciation variants retain their own spelling boundaries", () => {
  const us = ["l æ1", "b ɹ ə0", "t ɔː2", "ɹ i0"].map((label, i) =>
    syllable("laboratory", i, 80, label),
  );
  const gb = ["l ɐ0", "b ɒ1", "ɹ ə0", "t ɹ i0"].map((label, i) =>
    syllable("laboratory", i, 80, label),
  );
  assert.deepEqual(
    syllableLetters("Laboratory", us).map((s) => s.text),
    ["La", "bora", "to", "ry"],
  );
  assert.deepEqual(
    syllableLetters("Laboratory", gb).map((s) => s.text),
    ["La", "bo", "ra", "tory"],
  );
});
