import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
test("audio-only recognizer, word dictionary and synthetic word library have complete pinned assets", async () => {
  const manifest = JSON.parse(
    await readFile("src/speech/recognition-manifest.json", "utf8"),
  );
  const dir = "public/" + manifest.assetDirectory;
  assert.deepEqual(
    JSON.parse(await readFile(dir + "manifest.json", "utf8")),
    manifest,
  );
  assert.equal(manifest.revision, "22aad52d435eb6dbaf354bdad9b0da84ce7d6156");
  assert.equal(
    manifest.exporterSha256,
    sha(await readFile("training/export_recognition.py")),
  );
  assert.equal(
    manifest.referenceExporterSha256,
    sha(await readFile("training/export_word_references.py")),
  );
  let total = 0;
  const encoder = createHash("sha256");
  for (const f of manifest.files) {
    const bytes = await readFile(dir + f.path);
    assert.equal(bytes.length, f.bytes);
    assert.equal(sha(bytes), f.sha256, f.path);
    assert.ok(f.bytes <= 48 * 1024 * 1024);
    total += f.bytes;
    if (f.kind === "recognizer") encoder.update(bytes);
  }
  assert.equal(total, manifest.totalBytes);
  assert.equal(encoder.digest("hex"), manifest.encoderSha256);
  const lexicon = JSON.parse(await readFile(dir + "lexicon.json", "utf8"));
  assert.equal(Object.keys(lexicon).length, manifest.lexiconWords);
  assert.ok(manifest.lexiconWords > 120000);
  const phones = JSON.parse(
    await readFile("public/models/blended-english-v3/comparison.json", "utf8"),
  ).vocab;
  for (const [word, variants] of Object.entries(lexicon)) {
    assert.match(word, /^[a-z]+(?:'[a-z]+)?$/);
    for (const labels of variants) {
      assert.ok(labels.length);
      for (const label of labels)
        for (const phone of label.split(" "))
          assert.ok(
            Number.isInteger(phones[phone.replace(/[012]+$/g, "")]),
            word,
          );
    }
  }
  const index = JSON.parse(
    await readFile(dir + "word-references.json", "utf8"),
  );
  assert.equal(Object.keys(index.words).length, manifest.referenceWords);
  assert.equal(index.heldOutVoices, false);
  for (const [word, refs] of Object.entries(index.words))
    for (const ref of refs) {
      assert.equal(ref.synthetic, true);
      if (ref.sourceTake?.startsWith("review-"))
        assert.equal(
          ref.accent,
          "en",
          "review examples have no verified accent label",
        );
      assert.match(ref.listeningStatus, /pending/);
      assert.ok(manifest.files.some((f) => f.path === ref.audio));
      assert.ok(ref.end > ref.start);
      assert.ok(
        ref.syllables.every(
          (s) =>
            s.word === word &&
            s.start >= ref.start - 0.001 &&
            s.end <= ref.end + 0.001,
        ),
      );
    }
  await readFile(dir + "LICENSE");
  await readFile(dir + "CMUDICT-LICENSE");
});
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

test("authored spelling groups preserve every fixed-question model syllable variant", async () => {
  const spelling = JSON.parse(
    await readFile("content/syllable-spelling.json", "utf8"),
  );
  const metadata = JSON.parse(
    await readFile("public/models/blended-english-v3/comparison.json", "utf8"),
  );
  const questions = JSON.parse(
    await readFile("content/questions.json", "utf8"),
  );
  assert.equal(spelling.version, 1);
  for (const [word, forms] of Object.entries(spelling.groups))
    for (const [count, letters] of Object.entries(forms)) {
      assert.equal(letters.length, Number(count), word);
      assert.equal(letters.join(""), word);
      assert.ok(
        letters.every((part) => part.length > 0),
        word,
      );
    }
  for (const q of questions.filter((q) =>
    ["read-aloud", "repeat-sentence"].includes(q.type),
  )) {
    const key = (q.text || q.audioText)
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .match(/[a-z]+(?:'[a-z]+)?/g)
      .join(" ");
    for (const variant of metadata.scripts[key]) {
      const words = new Map();
      for (const s of variant.syllables)
        words.set(s.wordIndex, [...(words.get(s.wordIndex) || []), s]);
      for (const syllables of words.values()) {
        if (syllables.length === 1) continue;
        const word = syllables[0].word,
          signature = syllables.map((s) => s.phonemes.join(" ")).join("|");
        const letters =
          spelling.variants[word]?.[signature] ||
          spelling.groups[word]?.[syllables.length];
        assert.ok(letters, `${q.id}/${variant.language}/${word}`);
        assert.equal(letters.length, syllables.length);
        assert.equal(letters.join(""), word);
      }
    }
  }
});
