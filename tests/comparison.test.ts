import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alignCTC,
  logProbabilities,
  normalizedAudio,
  reliableSignal,
} from "../src/speech/comparison-core";
import {
  pronunciationSchema,
  COMPARISON_MODEL_SHA,
  COMPARISON_EXPORT,
  pronunciationSummary,
} from "../src/speech/comparison-schema";
const value = {
  schemaVersion: 1,
  modelSha256: COMPARISON_MODEL_SHA,
  exportId: COMPARISON_EXPORT,
  referenceAccents: ["en-US", "en-GB", "en-AU", "en-IN"],
  seconds: 1,
  status: "scored",
  syllables: [
    {
      word: "hello",
      wordIndex: 0,
      syllableIndex: 0,
      label: "h ə0",
      start: 0,
      end: 1,
      similarity: 70,
      confidence: 0.2,
      status: "scored",
    },
  ],
} as const;
test("v3 scores require pinned identity, valid times and null uncertain syllables", () => {
  assert.equal(pronunciationSchema.safeParse(value).success, true);
  assert.equal(
    pronunciationSchema.safeParse({ ...value, modelSha256: "other" }).success,
    false,
  );
  assert.equal(
    pronunciationSchema.safeParse({ ...value, exportId: "word-match" }).success,
    false,
  );
  assert.equal(
    pronunciationSchema.safeParse({ ...value, seconds: 46 }).success,
    false,
  );
  assert.equal(
    pronunciationSchema.safeParse({
      ...value,
      syllables: [{ ...value.syllables[0], status: "uncertain" }],
    }).success,
    false,
  );
  const no = pronunciationSchema.parse({
    ...value,
    status: "unscored",
    syllables: [
      { ...value.syllables[0], status: "uncertain", similarity: null },
    ],
  });
  assert.equal(pronunciationSummary(no), null);
});
test("CTC preserves repeated target sounds separated by a blank and rejects impossible paths", () => {
  const logs = new Float32Array([
    Math.log(0.1),
    Math.log(0.9),
    Math.log(0.9),
    Math.log(0.1),
    Math.log(0.1),
    Math.log(0.9),
  ]);
  const spans = alignCTC(logs, 2, [1, 1]);
  assert.deepEqual(
    spans.map((s) => [s.start, s.end]),
    [
      [0, 1],
      [2, 3],
    ],
  );
  assert.throws(() => alignCTC(logs.slice(0, 4), 2, [1, 1]));
});
test("normalization removes gain/offset and log probabilities sum to one", () => {
  const x = new Float32Array([-0.5, 0.2, 0.7, -0.1]);
  const a = normalizedAudio(x),
    b = normalizedAudio(x.map((x) => x * 0.2 + 1));
  assert.ok(a.every((x, i) => Math.abs(x - b[i]) < 0.001));
  const log = logProbabilities(new Float32Array([2, 1, -2, 0]), 2);
  assert.ok(Math.abs(Math.exp(log[0]) + Math.exp(log[1]) - 1) < 1e-6);
});
test("silence and broadband noise receive no speech grade", () => {
  assert.equal(reliableSignal(new Float32Array(16000)), false);
  let state = 7;
  const noise = new Float32Array(16000);
  for (let i = 0; i < noise.length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    noise[i] = (state / 2147483648) * 0.1;
  }
  assert.equal(reliableSignal(noise), false);
  const tone = new Float32Array(16000).map((_, i) => Math.sin(i * 0.1) * 0.1);
  assert.equal(reliableSignal(tone), true);
});

test("app feedback uses the saved v3 grade rather than a transcript word match", async () => {
  const { questions, feedback } = await import("../src/content");
  const q = questions.find((q) => q.type === "read-aloud")!;
  const result = pronunciationSchema.parse(value);
  assert.equal(
    feedback(q, { recording: "blob:local", pronunciation: result }).label,
    "70/100 reference similarity",
  );
  assert.equal(
    feedback(q, { recording: "blob:local" }).label,
    "Ready to compare",
  );
});
