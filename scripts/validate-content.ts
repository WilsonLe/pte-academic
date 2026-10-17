import { createHash } from "node:crypto";
import {
  guides,
  questions,
  mocks,
  sections,
  guideFor,
} from "../src/content.ts";
import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
export function validateContent() {
  assert.equal(guides.length, 22, "Exactly 22 supported question types");
  for (const collection of [guides, questions, mocks])
    assert.equal(
      new Set(collection.map((x) => x.id)).size,
      collection.length,
      "IDs must be unique",
    );
  for (const q of questions) {
    const g = guideFor(q);
    assert(g, `Unknown type ${q.type}`);
    const audioRequired =
      g.section === "listening" ||
      [
        "repeat-sentence",
        "retell-lecture",
        "answer-short-question",
        "summarize-group-discussion",
        "respond-to-situation",
      ].includes(g.id);
    if (audioRequired) {
      assert(q.audio && q.audioText, `${q.id}: audio + transcript required`);
      assert(existsSync(`public/${q.audio}`), `Missing audio ${q.audio}`);
    }
    if (["single", "multi", "order", "bank"].includes(g.kind))
      assert(
        q.options?.length && q.answers?.length,
        `${q.id}: options/key required`,
      );
    if (["dropdown", "bank", "blanks"].includes(g.kind)) {
      assert(q.text);
      const n = q.text.split("{{}}").length - 1;
      assert(n > 0);
      assert.equal(n, q.answers?.length, `${q.id}: blank/key count`);
      if (g.kind === "dropdown") {
        assert.equal(n, q.blankOptions?.length);
        q.answers!.forEach((x, i) => assert(q.blankOptions![i].includes(x)));
      }
      if (g.kind === "bank")
        q.answers!.forEach((x) => assert(q.options!.includes(x)));
    }
    if (["single", "multi", "order", "highlight"].includes(g.kind)) {
      assert(q.answers?.length);
      const length =
        g.kind === "highlight"
          ? q.text!.split(/\s+/).length
          : q.options!.length;
      q.answers!.forEach((x) =>
        assert(Number.isInteger(+x) && +x >= 0 && +x < length),
      );
      assert.equal(new Set(q.answers).size, q.answers!.length);
      if (g.kind === "single") assert.equal(q.answers!.length, 1);
      if (g.kind === "order") {
        assert.equal(q.answers!.length, q.options!.length);
        assert.equal(
          q.orderExplanations?.length,
          q.answers!.length,
          `${q.id}: every ordered paragraph needs its own explanation`,
        );
      }
    }
    if (["speak", "write", "dictation"].includes(g.kind))
      assert(q.model, `${q.id}: model required`);
    if (q.chart) assert.equal(q.chart.labels.length, q.chart.values.length);
  }
  for (const g of guides)
    assert(
      questions.some((q) => q.type === g.id),
      `No questions for ${g.id}`,
    );
  for (const mock of mocks) {
    assert.equal(
      new Set(mock.questionIds).size,
      mock.questionIds.length,
      "Do not duplicate mock questions",
    );
    const order = mock.questionIds.map((id) => {
      const q = questions.find((x) => x.id === id);
      assert(q, `Unknown mock ID ${id}`);
      return guideFor(q).order;
    });
    assert(
      order.every((x, i) => i === 0 || x >= order[i - 1]),
      "Mock must follow test order",
    );
    for (const g of guides)
      assert(
        mock.questionIds.some(
          (id) => questions.find((q) => q.id === id)?.type === g.id,
        ),
        `Mock missing ${g.id}`,
      );
    for (const s of sections) assert(mock.sectionMinutes[s.id] > 0);
  }
  const narration = JSON.parse(readFileSync("content/narration.json", "utf8"));
  for (const q of questions.filter((q) => q.audio)) {
    const take = narration.takes.find(
      (t: { audio: string }) => t.audio === q.audio,
    );
    assert(
      take && take.durationSeconds > 0,
      `Missing audio provenance ${q.id}`,
    );
    assert.equal(
      take.scriptSha256,
      createHash("sha256").update(q.audioText!).digest("hex"),
      `Stale audio script ${q.id}`,
    );
    assert.equal(
      take.audioSha256,
      createHash("sha256")
        .update(readFileSync(`public/${q.audio}`))
        .digest("hex"),
      `Audio integrity mismatch ${q.id}`,
    );
  }
  const policy = JSON.parse(readFileSync("content/authoring.json", "utf8"));
  assert.equal(
    policy.spendingLimitUsd,
    17.0113639,
    "Changing the authorized cumulative budget requires operator approval and updating this assertion",
  );
  assert.equal(
    policy.budgetAuthorizations?.[0]?.operatorDecision,
    "Fresh $10 from now",
  );
  assert.equal(
    policy.budgetAuthorizations?.[0]?.priorCumulativeReservedUsd,
    7.0113639,
  );
  assert.equal(policy.budgetAuthorizations?.[0]?.additionalAllowanceUsd, 10);
  assert.equal(policy.budgetAuthorizations?.[0]?.priorReservationCount, 5736);
  assert.equal(
    policy.budgetAuthorizations?.[0]?.cumulativeCapUsd,
    policy.spendingLimitUsd,
  );
  assert.equal(policy.budgetAuthorizations?.[0]?.historyPreserved, true);
  assert.equal(policy.requiresOperatorApprovalToIncrease, true);

  return `${guides.length} guides, ${questions.length} original questions, ${mocks.length} full mock; assets and references valid`;
}
if (process.argv[1]?.endsWith("validate-content.ts"))
  console.log(validateContent());
