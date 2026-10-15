import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  validateCorpus,
  checkKeyBudget,
} from "../scripts/reference-corpus.mjs";
const corpus = JSON.parse(
  await readFile(
    new URL("../training/reference-corpus.json", import.meta.url),
    "utf8",
  ),
);
test("reference corpus has 100 distinct texts and four explicit American voices", () => {
  const takes = validateCorpus(corpus);
  assert.equal(takes.length, 400);
  assert.equal(new Set(takes.map((t) => t.takeId)).size, 400);
  assert.ok(corpus.voices.every((v) => /^[a][fm]_/.test(v)));
  assert.ok(corpus.voices.includes(corpus.heldOutVoice));
});
test("duplicate and unsafe corpus identities fail before a paid call", () => {
  assert.throws(() =>
    validateCorpus({
      ...corpus,
      passages: [...corpus.passages.slice(1), corpus.passages[1]],
    }),
  );
  assert.throws(() => validateCorpus({ ...corpus, voices: ["../outside"] }));
});
test("both project cap and actual provider remaining credit gate generation", () => {
  const key = { usage: 0.2, limit: 10, limit_remaining: 9.8 };
  assert.doesNotThrow(() => checkKeyBudget(key, 10, 0.1, 0.3));
  for (const bad of [
    { ...key, limit: 11 },
    { ...key, limit_reset: "monthly" },
    { ...key, usage: undefined },
    { ...key, limit_remaining: 0.01 },
  ])
    assert.throws(() => checkKeyBudget(bad, 10, 0.1, 0.3));
  assert.throws(() => checkKeyBudget(key, 10, 0.1, 9.99));
});
