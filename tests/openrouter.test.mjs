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

test("fresh allowance preserves prior spend in the cumulative guard", () => {
  const historical = 7.0113639,
    cumulative = historical + 10;
  assert.doesNotThrow(() => enforceBudget(10, cumulative, historical));
  assert.throws(() => enforceBudget(10.001, cumulative, historical));
  assert.throws(() => enforceBudget(0.001, cumulative, cumulative));
  assert.throws(() => enforceBudget(10, cumulative, historical + 0.01));
});

import { authorizedBudget } from "../scripts/openrouter.mjs";
import { createHash } from "node:crypto";
test("allowance authorization rejects deleted or changed historical reservations", () => {
  const ledger = {
    schemaVersion: 1,
    reservations: [{ costUsd: 3 }, { costUsd: 4.0113639 }],
  };
  const prefix = createHash("sha256")
    .update(JSON.stringify(ledger.reservations))
    .digest("hex");
  const policy = {
    spendingLimitUsd: 17.0113639,
    requiresOperatorApprovalToIncrease: true,
    budgetAuthorizations: [
      {
        priorReservationCount: 2,
        priorCumulativeReservedUsd: 7.0113639,
        additionalAllowanceUsd: 10,
        cumulativeCapUsd: 17.0113639,
        historyPreserved: true,
        priorReservationsSha256: prefix,
      },
    ],
  };
  assert.equal(authorizedBudget(policy, ledger), 17.0113639);
  assert.equal(
    authorizedBudget(policy, {
      ...ledger,
      reservations: [...ledger.reservations, { costUsd: 1 }],
    }),
    17.0113639,
  );
  assert.throws(
    () => authorizedBudget(policy, { ...ledger, reservations: [] }),
    /cutoff/,
  );
  assert.throws(
    () =>
      authorizedBudget(policy, {
        ...ledger,
        reservations: [{ costUsd: 4 }, { costUsd: 3.0113639 }],
      }),
    /Historical/,
  );
  assert.throws(
    () => authorizedBudget({ ...policy, budgetAuthorizations: [] }, ledger),
    /explicit operator/,
  );
  assert.throws(
    () => authorizedBudget({ ...policy, spendingLimitUsd: 20 }, ledger),
    /authorization/,
  );
});
