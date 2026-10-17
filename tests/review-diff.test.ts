import { test } from "node:test";
import assert from "node:assert/strict";
import { guides, questions, guideFor, normalize } from "../src/content";
import { reviewItems, dictationDiff } from "../src/review-diff";

test("all 22 question types build contextual feedback without mutating saved answers", () => {
  const types = new Set<string>();
  for (const q of questions) {
    types.add(q.type);
    for (const answer of [
      {},
      {
        text: q.model || "An independent response.",
        values: q.answers || [],
        transcription: {
          text: "A saved transcript",
          seconds: 3,
          engine: "legacy-local",
          model: "legacy",
          revision: "old",
        },
      },
    ]) {
      const before = structuredClone(answer);
      const items = reviewItems(q, answer);
      assert.ok(items.length, q.id);
      assert.equal(
        new Set(items.map((item) => item.id)).size,
        items.length,
        q.id,
      );
      for (const item of items) {
        assert.ok(item.parts.length && item.detail.length, q.id);
        assert.ok(
          item.parts.every((part) => part.text.length),
          q.id,
        );
      }
      assert.deepEqual(answer, before, q.id);
    }
  }
  assert.deepEqual([...types].sort(), guides.map((g) => g.id).sort());
});

test("every reorder position explains its opening/conclusion and both available neighbours", () => {
  for (const q of questions.filter((q) => guideFor(q).kind === "order")) {
    assert.equal(q.orderExplanations!.length, q.answers!.length);
    const partial = reviewItems(q, { values: q.answers!.slice(0, 1) });
    assert.equal(partial[0].parts.length, 1);
    assert.equal(partial[0].state, "In place");
    q.orderExplanations!.forEach((reason, i) => {
      if (i > 0)
        assert.ok(
          reason.includes(`paragraph ${i}`),
          `${q.id}: preceding ${i + 1}`,
        );
      else assert.match(reason, /first/);
      if (i < q.answers!.length - 1)
        assert.ok(
          reason.includes(`paragraph ${i + 2}`),
          `${q.id}: following ${i + 1}`,
        );
      else assert.match(reason, /last/);
      assert.equal(partial[i].detail[0].text, reason);
      assert.equal(
        partial[i].parts.at(-1)!.text,
        q.options![Number(q.answers![i])],
      );
    });
    const wrong = reviewItems(q, { values: [...q.answers!].reverse() });
    assert.ok(
      wrong.every(
        (item) => item.parts[0].tone === "bad" && item.parts[1].tone === "good",
      ),
    );
  }
});

test("choice, gap and highlight diffs retain selected, missed and unanswered positions", () => {
  const multi = questions.find((q) => q.type === "reading-multiple")!;
  const choices = reviewItems(multi, { values: ["0", "2"] });
  assert.equal(choices[0].state, "Selected · Correct");
  assert.equal(choices[1].state, "Missed");
  assert.equal(choices[2].parts[0].tone, "bad");
  assert.equal(choices[3].parts[0].tone, "neutral");
  for (const type of [
    "reading-dropdown",
    "reading-blanks",
    "listening-blanks",
  ]) {
    const q = questions.find((q) => q.type === type)!;
    const items = reviewItems(q, { values: ["", q.answers![1]] });
    assert.equal(items[0].title, "Gap 1");
    assert.equal(items[0].state, "Unanswered");
    assert.equal(items[0].parts[1].text, q.answers![0]);
    assert.equal(items[1].parts.length, 1);
  }
  const q = questions.find((q) => q.type === "highlight-incorrect")!;
  const words = reviewItems(q, { values: ["0"] });
  assert.equal(words[0].title, "Word 1");
  assert.equal(words[0].state, "Selected · Incorrect");
  assert.equal(words[1].title, "Word 10");
  assert.equal(words[1].state, "Missed");
  assert.equal(words[1].parts[0].text, "quickly.");
  assert.equal(words[1].parts[1].text, "carefully.");
});

test("highlight feedback distinguishes false positives, correct selections and missed changes", () => {
  for (const q of questions.filter((q) => guideFor(q).kind === "highlight")) {
    const written = q.text!.trim().split(/\s+/);
    const heard = q.audioText!.trim().split(/\s+/);
    const unchanged = written.findIndex(
      (_, i) => !q.answers!.includes(String(i)),
    );
    const selectedChange = q.answers![0];
    const values = [String(unchanged), selectedChange];
    const before = [...values];
    const selected = reviewItems(q, { values });
    const falsePositive = selected.find(
      (item) => item.id === String(unchanged),
    )!;
    assert.equal(falsePositive.state, "Selected · Incorrect");
    assert.deepEqual(falsePositive.parts, [
      { text: written[unchanged], tone: "neutral", mark: "" },
    ]);
    const reason = falsePositive.detail.map((block) => block.text).join(" ");
    assert.match(reason, /matches the recording/);
    assert.match(reason, /remain unselected/);
    assert.ok(!reason.includes(written[Number(selectedChange)]), q.id);
    assert.ok(
      !falsePositive.detail.some((block) => block.text === q.explanation),
    );

    const correct = selected.find((item) => item.id === selectedChange)!;
    assert.equal(correct.state, "Selected · Correct");
    assert.deepEqual(
      correct.parts.map((part) => part.text),
      [written[Number(selectedChange)], heard[Number(selectedChange)]],
    );
    assert.match(correct.detail[0].text, /correctly selected/);
    const missed = reviewItems(q, { values: [String(unchanged)] }).filter(
      (item) => q.answers!.includes(item.id),
    );
    assert.equal(missed.length, q.answers!.length);
    for (const item of missed) {
      assert.equal(item.title, `Word ${Number(item.id) + 1}`);
      assert.equal(item.state, "Missed");
      assert.match(item.detail[0].text, /should be selected/);
      assert.deepEqual(
        item.parts,
        selected.find((word) => word.id === item.id)!.parts,
      );
    }
    assert.deepEqual(values, before);
  }
});

test("dictation alignment preserves repeated words, extra/missing words and display punctuation", () => {
  for (const [actual, expected] of [
    ["The the results wrong.", "The results will be published."],
    ["HELLO, world!", "Hello world."],
    ["( HELLO, world ! )", "Hello world."],
    ["", "One two two three."],
    ["Extra words here.", ""],
  ]) {
    const parts = dictationDiff(actual, expected).flat();
    const recovered = parts
      .filter((p) => p.tone === "bad" || p.mark === "✓")
      .map((p) => p.text)
      .join(" ");
    const key = parts
      .filter((p) => p.tone === "good")
      .map((p) => p.text)
      .join(" ");
    assert.equal(recovered, actual);
    assert.equal(normalize(key), normalize(expected));
  }
  assert.ok(
    dictationDiff("HELLO, world!", "Hello world.")
      .flat()
      .every((p) => p.mark === "✓"),
  );
  assert.ok(
    dictationDiff("( HELLO, world ! )", "Hello world.")
      .flat()
      .every((part) => part.mark === "✓"),
  );
});

test("writing and legacy speech use neutral response selections with disclosed alternatives", () => {
  for (const q of questions.filter((q) =>
    ["write", "speak"].includes(guideFor(q).kind),
  )) {
    const text = "A different, valid response. ".repeat(40).trim();
    const items = reviewItems(q, {
      text,
      transcription: {
        text,
        seconds: 3,
        engine: "legacy-local",
        model: "legacy",
        revision: "old",
      },
    });
    assert.ok(
      items.every((item) => item.parts.every((p) => p.tone === "neutral")),
      q.id,
    );
    assert.equal(
      items.flatMap((item) => item.parts.map((p) => p.text)).join(" "),
      text,
    );
    assert.ok(
      items[0].detail.some((b) => b.text === q.model),
      q.id,
    );
    assert.ok(
      items[0].detail.some((b) => b.text === q.explanation),
      q.id,
    );
    if (q.type === "write-essay")
      assert.ok(items[0].detail.some((b) => b.label === "Planning outline"));
  }
});
