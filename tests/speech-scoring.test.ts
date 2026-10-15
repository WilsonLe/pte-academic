import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareWords,
  speechFeedback,
  spokenWords,
} from "../src/speech/scoring";
import {
  SPEECH_ENGINE,
  SPEECH_MODEL,
  SPEECH_REVISION,
} from "../src/speech/config";
import { questions } from "../src/content";
const value = (text: string) => ({
  text,
  seconds: 10,
  engine: SPEECH_ENGINE,
  model: SPEECH_MODEL,
  revision: SPEECH_REVISION,
});
test("word scoring aligns omissions, substitutions and insertions without rewarding padding", () => {
  const r = compareWords(
    "the library stays open late",
    "the library remains open very late",
  )!;
  assert.equal(r.errors, 2);
  assert.equal(r.accuracy, 60);
  assert.equal(r.alignment.filter((w) => w.kind === "substitution").length, 1);
  assert.equal(r.alignment.filter((w) => w.kind === "extra").length, 1);
  const missing = compareWords("one two two three", "one two three")!;
  assert.equal(missing.errors, 1);
  assert.equal(missing.accuracy, 75);
  assert.equal(compareWords("one", "one two three")!.accuracy, 0);
});
test("normalization preserves contractions, ignores punctuation/case, and empty speech receives no score", () => {
  assert.deepEqual(spokenWords("DON’T, stop. It’s 2!"), [
    "don't",
    "stop",
    "it's",
    "2",
  ]);
  assert.equal(compareWords("Hello, WORLD!", "hello world")!.accuracy, 100);
  assert.equal(compareWords("hello", ""), null);
  assert.equal(compareWords("", "hello"), null);
  assert.equal(compareWords("one", "word ".repeat(501)), null);
});
test("only fixed-word tasks receive word match; short answers accept leading articles; open responses retain self-review", () => {
  const read = questions.find((q) => q.type === "read-aloud")!;
  assert.equal(
    speechFeedback(read, value(read.text!)).comparison!.accuracy,
    100,
  );
  const repeat = questions.find((q) => q.type === "repeat-sentence")!;
  assert.equal(
    speechFeedback(repeat, value(repeat.audioText!)).comparison!.accuracy,
    100,
  );
  const short = questions.find((q) => q.type === "answer-short-question")!;
  assert.equal(speechFeedback(short, value("Thermometer!")).answerMatch, true);
  assert.equal(
    speechFeedback(short, value("The thermometer.")).answerMatch,
    true,
  );
  assert.equal(speechFeedback(short, value("A telescope.")).answerMatch, false);
  const open = questions.find((q) => q.type === "describe-image")!;
  const result = speechFeedback(
    open,
    value("The chart compares four categories."),
  );
  assert.equal(result.comparison, null);
  assert.equal(result.answerMatch, null);
  assert.equal(result.words, 5);
  assert.equal(result.wordsPerMinute, 30);
  assert.equal(speechFeedback(open, value("")).wordsPerMinute, null);
});
