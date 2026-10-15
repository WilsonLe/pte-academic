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

import {
  runWorkerPool,
  serialCoordinator,
} from "../scripts/reference-corpus.mjs";
test("parallel corpus workers preserve a single budget reservation order", async () => {
  const serial = serialCoordinator();
  let reserved = 0,
    active = 0,
    peak = 0,
    accepted = 0;
  await runWorkerPool(
    Array.from({ length: 20 }, (_, i) => i),
    8,
    async () => {
      active++;
      peak = Math.max(peak, active);
      try {
        await serial(async () => {
          await new Promise((r) => setTimeout(r, 1));
          try {
            checkKeyBudget(
              { usage: 0, limit: 1, limit_remaining: 1 },
              1,
              0.2,
              reserved,
            );
            reserved += 0.2;
            accepted++;
          } catch {}
        });
      } finally {
        active--;
      }
    },
  );
  assert.equal(accepted, 5);
  assert.ok(reserved <= 1);
  assert.ok(peak > 1 && peak <= 8);
});
test("a failed request stops new scheduling and drains in-flight work", async () => {
  const started = [],
    finished = [];
  await assert.rejects(
    () =>
      runWorkerPool([0, 1, 2, 3, 4, 5, 6], 3, async (i) => {
        started.push(i);
        if (i === 0) throw Error("uncertain paid request");
        await new Promise((r) => setTimeout(r, 5));
        finished.push(i);
      }),
    /scheduling stopped/,
  );
  assert.deepEqual(started, [0, 1, 2]);
  assert.deepEqual(finished, [1, 2]);
});
test("expanded corpus isolates scene families and includes four accents", async () => {
  const c = JSON.parse(
    await readFile(
      new URL("../training/reference-corpus-v2.json", import.meta.url),
      "utf8",
    ),
  );
  const takes = validateCorpus(c);
  assert.equal(takes.length, 5000);
  assert.equal(new Set(takes.map((t) => t.text)).size, 500);
  assert.deepEqual([...new Set(takes.map((t) => t.accent))].sort(), [
    "en-AU",
    "en-GB",
    "en-IN",
    "en-US",
  ]);
  const families = new Map();
  for (const p of c.passages) {
    if (families.has(p.familyId))
      assert.equal(families.get(p.familyId), p.split);
    families.set(p.familyId, p.split);
  }
  for (const accent of ["en-US", "en-GB", "en-AU", "en-IN"]) {
    assert.ok(c.voices.some((v) => v.accent === accent && !v.heldOut));
    assert.equal(
      c.voices.filter((v) => v.accent === accent && v.heldOut).length,
      1,
    );
  }
  const broken = structuredClone(c);
  broken.passages[1].familyId = broken.passages[0].familyId;
  broken.passages[1].split = "test";
  assert.throws(() => validateCorpus(broken), /family crosses/);
});
