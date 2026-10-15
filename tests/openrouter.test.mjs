import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateCost } from "../scripts/openrouter.mjs";
test("TTS cost plan accounts for Unicode characters and all selected scripts", () => {
  assert.equal(
    estimateCost(["abc", "🙂"], {
      pricing: { prompt: "0.01", completion: "0" },
    }),
    0.04,
  );
});
test("unknown or output-based pricing cannot pass bounded generation planning", () => {
  for (const pricing of [
    { prompt: "bad", completion: "0" },
    { prompt: ".001", completion: ".001" },
    { prompt: "-1", completion: "0" },
  ])
    assert.throws(() => estimateCost(["hello"], { pricing }));
});
import { enforceBudget } from "../scripts/openrouter.mjs";
test("project budget is cumulative and cannot be bypassed with a larger run allowance", () => {
  assert.doesNotThrow(() => enforceBudget(0.18, 10, 0));
  assert.doesNotThrow(() => enforceBudget(0.1, 10, 9.9));
  assert.throws(() => enforceBudget(0.11, 10, 9.9), /ask the operator/);
  assert.throws(() => enforceBudget(0.01, 10, 10));
  assert.throws(() => enforceBudget(0, NaN, 0));
});
