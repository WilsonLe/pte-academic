import { reliableSignal } from "../src/speech/comparison-core";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  speechWindows,
  usesBaseRecognizer,
  recognizeWords,
  speechWindowBounds,
  wordVariants,
  scoreRecognizedWords,
} from "../src/speech/recognition-core";
import { recognizedFeedbackWords } from "../src/speech/SpeechDiff";
import {
  pronunciationSchema,
  COMPARISON_MODEL_SHA,
  COMPARISON_EXPORT,
  type Pronunciation,
} from "../src/speech/comparison-schema";

const vocab = { "<pad>": 0, "|": 1, L: 2, O: 3, K: 4, A: 5, T: 6 };
const ctc = (ids: number[]) =>
  Float32Array.from(
    ids.flatMap((id) =>
      Object.keys(vocab).map((_, i) => (i === id ? 10 : -10)),
    ),
  );
const spoken = ["look", "at", "look"].map((word, index) => ({
  word,
  index,
  start: index,
  end: index + 0.8,
  confidence: 0.95,
  status: "recognized" as const,
}));
const result: Pronunciation = {
  schemaVersion: 1,
  modelSha256: COMPARISON_MODEL_SHA,
  exportId: COMPARISON_EXPORT,
  referenceAccents: ["en-US", "en-GB", "en-AU", "en-IN"],
  seconds: 3,
  status: "unscored",
  syllables: [],
  recognition: { modelId: "audio-only-words-v1", words: spoken },
};

test("audio-only CTC preserves doubled letters, repeated words and bounded non-overlapping word times", () => {
  const ids = [0, 2, 2, 3, 0, 3, 4, 0, 1, 5, 6, 1, 2, 3, 0, 3, 4, 0];
  const words = recognizeWords(ctc(ids), vocab, 3);
  assert.deepEqual(
    words.map((w) => w.word),
    ["look", "at", "look"],
  );
  words.forEach((w, i) => {
    assert.equal(w.index, i);
    assert.ok(w.confidence > 0.99);
    assert.ok(w.end > w.start);
    assert.ok(w.end <= 3);
    if (i) assert.ok(w.start >= words[i - 1].end);
  });
  assert.deepEqual(recognizeWords(ctc([0, 0, 0]), vocab, 1), []);
});
test("dictionary targets are built from the recognised word, with distinct occurrence indexes", () => {
  const variants = wordVariants("look", { look: [["l ʊ1 k"], ["l u1 k"]] }, 7);
  assert.equal(variants.length, 2);
  assert.deepEqual(variants[0].syllables[0].phoneIndexes, [0, 1, 2]);
  assert.equal(variants[0].syllables[0].wordIndex, 7);
  assert.equal(variants[0].syllables[0].word, "look");
  assert.deepEqual(wordVariants("unknown", {}), []);
});
test("unsupported and low-confidence recognition never receive an invented phonetic score", () => {
  const words = [
    { ...spoken[0], word: "unlisted" },
    { ...spoken[1], confidence: 0.2 },
  ];
  const meta = { vocab: { p: 0 } } as any;
  assert.deepEqual(
    scoreRecognizedWords(
      new Float32Array(16000),
      new Float32Array(1024),
      new Float32Array(1),
      words,
      { at: [["æ1 t"]] },
      meta,
    ),
    [],
  );
  assert.deepEqual(
    words.map((w) => w.status),
    ["unsupported", "uncertain"],
  );
});
test("optional prompt diff cannot change recognized content or grades; no text is supported", () => {
  const before = JSON.stringify(result);
  const diff = recognizedFeedbackWords("look over look", result);
  assert.deepEqual(
    diff.map((w) => w.word),
    ["look", "at", "look"],
  );
  assert.equal(diff[1].expected, "over");
  assert.deepEqual(
    recognizedFeedbackWords("", result).map((w) => w.spoken?.word),
    ["look", "at", "look"],
  );
  assert.equal(JSON.stringify(result), before);
  const omitted = recognizedFeedbackWords("look up at look", result).find(
    (w) => w.omitted,
  )!;
  assert.equal(omitted.word, "up");
  assert.ok(omitted.index < 0);
});
test("additive recognised evidence supports long speaking responses and validates times/occurrence identity", () => {
  assert.ok(pronunciationSchema.safeParse(result).success);
  assert.ok(pronunciationSchema.safeParse({ ...result, seconds: 90 }).success);
  assert.equal(
    pronunciationSchema.safeParse({
      ...result,
      recognition: undefined,
      seconds: 90,
    }).success,
    false,
  );
  assert.equal(
    pronunciationSchema.safeParse({
      ...result,
      recognition: { ...result.recognition, words: [{ ...spoken[0], end: 4 }] },
    }).success,
    false,
  );
  assert.equal(
    pronunciationSchema.safeParse({
      ...result,
      recognition: {
        ...result.recognition,
        words: [{ ...spoken[0], index: 5 }],
      },
    }).success,
    false,
  );
});

test("silent pauses do not suppress speech while silence and broadband noise stay rejected", () => {
  const mixed = new Float32Array(16000 * 5);
  for (let i = 16000; i < 24000; i++)
    mixed[i] = 0.1 * Math.sin((2 * Math.PI * 190 * i) / 16000);
  assert.equal(reliableSignal(mixed), true);
  assert.equal(reliableSignal(new Float32Array(16000)), false);
  let state = 17;
  const noise = Float32Array.from({ length: 16000 }, () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state / 4294967296 - 0.5) * 0.1;
  });
  assert.equal(reliableSignal(noise), false);
});

test("bounded windows trim long silent tails while preserving acoustic context and global offsets", () => {
  const audio = new Float32Array(16000 * 20);
  audio.fill(0.05, 16000 * 8, 16000 * 9);
  assert.deepEqual(speechWindowBounds(audio), {
    start: 16000 * 8 - 3200,
    end: 16000 * 9 + 3200,
  });
  assert.equal(speechWindowBounds(new Float32Array(16000)), undefined);
});

test("new recognition provenance survives validation without changing legacy evidence", () => {
  const original = JSON.stringify(result);
  const recognition = {
    ...result.recognition!,
    recognizerSha256: "a".repeat(64),
    recognizerRevision: "b".repeat(40),
    decoder: "greedy-ctc-adaptive-v1" as const,
    windowSeconds: 20 as const,
  };
  assert.deepEqual(
    pronunciationSchema.parse({ ...result, recognition }).recognition,
    recognition,
  );
  assert.ok(pronunciationSchema.safeParse(result).success);
  assert.equal(JSON.stringify(result), original);
  assert.equal(
    pronunciationSchema.safeParse({
      ...result,
      recognition: { ...recognition, recognizerSha256: "wrong" },
    }).success,
    false,
  );
});

test("short recognition spans own every boundary once while phonetic context stays unchanged", () => {
  const audio = new Float32Array(125 * 16000).fill(0.01);
  for (const seconds of [10, 20] as const) {
    const windows = speechWindows(audio, seconds);
    assert.equal(windows.length, Math.ceil(125 / seconds));
    windows.forEach((window, i) => {
      assert.deepEqual(window, {
        start: Math.max(0, i * seconds - 1) * 16000,
        end: Math.min(125, (i + 1) * seconds + 1) * 16000,
        keepStart: i * seconds,
        keepEnd: Math.min(125, (i + 1) * seconds),
      });
      assert.ok(window.end - window.start <= (seconds + 2) * 16000);
    });
    for (const middle of [0, 9.999, 10, 10.001, 19.999, 20, 20.001, 124.999])
      assert.equal(
        windows.filter((w) => middle >= w.keepStart && middle < w.keepEnd)
          .length,
        1,
      );
  }
  assert.deepEqual(speechWindows(new Float32Array(125 * 16000), 10), []);
});

test("isolated and expensive trimmed context preserve the original recognizer", () => {
  assert.equal(usesBaseRecognizer([{ start: 0, end: 2 * 16000 - 1 }]), true);
  assert.equal(usesBaseRecognizer([{ start: 0, end: 2 * 16000 }]), false);
  assert.equal(usesBaseRecognizer([{ start: 0, end: 45 * 16000 }]), false);
  assert.equal(usesBaseRecognizer([{ start: 0, end: 45 * 16000 + 1 }]), true);
  assert.equal(
    usesBaseRecognizer(speechWindows(new Float32Array(125 * 16000), 20)),
    true,
  );
  assert.equal(
    usesBaseRecognizer(
      speechWindows(new Float32Array(40 * 16000).fill(0.01), 20),
    ),
    false,
  );
  assert.equal(
    usesBaseRecognizer(
      speechWindows(new Float32Array(125 * 16000).fill(0.01), 20),
    ),
    true,
  );
  const tail = new Float32Array(125 * 16000);
  tail.set(new Float32Array(19 * 16000).fill(0.01), 16000);
  assert.equal(usesBaseRecognizer(speechWindows(tail, 20)), false);
  const separated = new Float32Array(125 * 16000);
  separated.set(new Float32Array(5 * 16000).fill(0.01), 16000);
  separated.set(new Float32Array(5 * 16000).fill(0.01), 70 * 16000);
  assert.equal(usesBaseRecognizer(speechWindows(separated, 20)), false);
});

test("regional judgement spellings are display equivalents without replacing recognised evidence", () => {
  for (const [prompt, recognized] of [
    ["judgement", "judgment"],
    ["judgment", "judgement"],
    ["judgements", "judgments"],
  ]) {
    const evidence: Pronunciation = {
      ...result,
      recognition: {
        ...result.recognition!,
        words: [{ ...spoken[0], word: recognized }],
      },
    };
    const before = JSON.stringify(evidence);
    const diff = recognizedFeedbackWords(prompt, evidence);
    assert.equal(diff.length, 1);
    assert.equal(diff[0].expected, undefined);
    assert.equal(diff[0].omitted, undefined);
    assert.equal(diff[0].word, recognized);
    assert.equal(diff[0].spoken, evidence.recognition!.words[0]);
    assert.equal(JSON.stringify(evidence), before);
  }
  const evidence: Pronunciation = {
    ...result,
    recognition: {
      ...result.recognition!,
      words: [{ ...spoken[0], word: "two" }],
    },
  };
  assert.equal(recognizedFeedbackWords("too", evidence)[0].expected, "too");
  evidence.recognition!.words[0].word = "judgemant";
  assert.equal(
    recognizedFeedbackWords("judgement", evidence)[0].expected,
    "judgement",
  );
});
