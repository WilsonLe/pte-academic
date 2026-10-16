import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
test("browser model pack is complete, pinned to accepted v3, and covers every fixed-word speech question", async () => {
  const manifest = JSON.parse(
      await readFile("src/speech/comparison-manifest.json", "utf8"),
    ),
    directory = "public/" + manifest.assetDirectory;
  assert.deepEqual(
    JSON.parse(await readFile(directory + "manifest.json", "utf8")),
    manifest,
  );
  assert.equal(
    manifest.modelSha256,
    "2a8e9680e71c85d98f2adc8da725c56f21bd866340cf545916fdf5dff7389d1b",
  );
  assert.equal(sha(await readFile(manifest.source)), manifest.modelSha256);
  assert.equal(
    sha(await readFile("training/export_browser.py")),
    manifest.exporterSha256,
  );
  let total = 0;
  const encoder = createHash("sha256");
  for (const file of manifest.files) {
    const bytes = await readFile(directory + file.path);
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(sha(bytes), file.sha256, file.path);
    assert.ok(bytes.length <= 48 * 1024 * 1024);
    total += bytes.length;
    if (file.kind === "encoder") encoder.update(bytes);
  }
  assert.equal(total, manifest.totalBytes);
  assert.equal(encoder.digest("hex"), manifest.encoderSha256);
  const metadata = JSON.parse(
    await readFile(directory + "comparison.json", "utf8"),
  );
  assert.equal(metadata.modelSha256, manifest.modelSha256);
  assert.equal(metadata.featureRepresentation, "hidden-ctc-v1");
  assert.equal(metadata.mean.length, 1416);
  assert.equal(metadata.std.length, 1416);
  assert.ok(metadata.std.every((x) => x > 0 && Number.isFinite(x)));
  assert.equal(metadata.confidenceThreshold, 0.03);
  const questions = JSON.parse(
    await readFile("content/questions.json", "utf8"),
  );
  for (const question of questions.filter((q) =>
    ["read-aloud", "repeat-sentence"].includes(q.type),
  )) {
    const text =
        question.type === "read-aloud" ? question.text : question.audioText,
      key = (
        text
          .toLowerCase()
          .replace(/[’‘]/g, "'")
          .match(/[a-z]+(?:'[a-z]+)?/g) || []
      ).join(" "),
      variants = metadata.scripts[key];
    assert.ok(variants?.length, `Re-export phonetics for ${question.id}`);
    for (const variant of variants) {
      assert.ok(
        variant.phones.every((p) =>
          Number.isInteger(metadata.vocab[p.replace(/[012]+$/g, "")]),
        ),
      );
      assert.deepEqual(
        variant.syllables.flatMap((s) => s.phoneIndexes),
        variant.phones.map((_, i) => i),
      );
    }
  }
});

test("every fixed speech question has integral review audio and estimated syllable bounds", async () => {
  const { readFile } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  const questions = JSON.parse(
    await readFile("content/questions.json", "utf8"),
  );
  const references = JSON.parse(
    await readFile("src/speech/reference-clips.json", "utf8"),
  );
  const narration = JSON.parse(
    await readFile("content/narration.json", "utf8"),
  );
  for (const q of questions.filter((q) =>
    ["read-aloud", "repeat-sentence"].includes(q.type),
  )) {
    const ref = references[q.id];
    assert.ok(ref && ref.syllables.length, q.id);
    const take = narration.takes.find((t) => t.audio === ref.audio);
    assert.ok(take, q.id);
    const hash = (v) => createHash("sha256").update(v).digest("hex");
    assert.equal(ref.audioSha256, hash(await readFile(`public/${ref.audio}`)));
    assert.equal(ref.scriptSha256, hash(q.text || q.audioText));
    assert.equal(ref.synthetic, true);
    assert.equal(ref.listeningStatus, take.listeningStatus);
    assert.ok(
      ref.syllables.every(
        (s) =>
          s.start >= 0 &&
          s.end > s.start &&
          s.end <= take.durationSeconds + 0.05,
      ),
    );
    const words = (q.text || q.audioText)
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .match(/[a-z]+(?:'[a-z]+)?/g);
    words.forEach((word, index) =>
      assert.ok(
        ref.syllables.some((s) => s.word === word && s.wordIndex === index),
        `${q.id}: ${index} ${word}`,
      ),
    );
    const metadata = JSON.parse(
      await readFile(
        "public/models/blended-english-v3/comparison.json",
        "utf8",
      ),
    );
    const key = words.join(" ");
    for (const candidate of metadata.scripts[key]) {
      const aligned = ref.variants.find(
        (v) => v.language === candidate.language,
      );
      assert.ok(aligned, `${q.id}: missing variant ${candidate.language}`);
      assert.deepEqual(
        aligned.syllables.map((s) => [s.wordIndex, s.syllableIndex, s.label]),
        candidate.syllables.map((s) => [
          s.wordIndex,
          s.syllableIndex,
          s.phonemes.join(" "),
        ]),
      );
      assert.ok(
        aligned.syllables.every(
          (s) =>
            s.start >= 0 &&
            s.end > s.start &&
            s.end <= take.durationSeconds + 0.05,
        ),
      );
    }
    if (q.type === "read-aloud")
      assert.equal(
        q.audio,
        undefined,
        "review examples must not enter the timed prompt",
      );
  }
});
