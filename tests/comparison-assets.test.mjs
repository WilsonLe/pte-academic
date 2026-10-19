import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
import { gunzipSync } from "node:zlib";
async function decoded(directory, file) {
  const raw = await readFile(directory + (file.transport?.path || file.path));
  if (!file.transport) return raw;
  assert.equal(raw.length, file.transport.bytes);
  assert.equal(sha(raw), file.transport.sha256);
  const data = gunzipSync(raw, { maxOutputLength: file.bytes });
  if (file.transport.encoding === "gzip") return data;
  assert.equal(file.transport.encoding, "gzip-shuffle2");
  const result = Buffer.alloc(data.length),
    half = Math.ceil(data.length / 2);
  for (let i = 0; i < half; i++) {
    result[i * 2] = data[i];
    if (i * 2 + 1 < data.length) result[i * 2 + 1] = data[half + i];
  }
  return result;
}
test("audio-only recognizer, word dictionary and synthetic word library have complete pinned assets", async () => {
  const manifest = JSON.parse(
    await readFile("src/speech/recognition-manifest.json", "utf8"),
  );
  const dir = "public/" + manifest.assetDirectory;
  assert.deepEqual(
    JSON.parse(await readFile(dir + "manifest.json", "utf8")),
    manifest,
  );
  assert.equal(manifest.revision, "54074b1c16f4de6a5ad59affb4caa8f2ea03a119");
  assert.equal(manifest.repository, "facebook/wav2vec2-large-960h-lv60-self");
  assert.equal(
    manifest.sourceWeightSha256,
    "00b604cf4d28e86559e8adaeb3a186daa89dc37f5ab216771a0a15a26db0de9f",
  );
  assert.equal(
    manifest.encoderSha256,
    "69df640ba26e45292aaefd6a57d4bea88ab05000fb28ca139478fbbbc035565a",
  );
  assert.equal(
    manifest.sourceFilesSha256["pytorch_model.bin"],
    manifest.sourceWeightSha256,
  );
  assert.equal(Object.keys(manifest.sourceFilesSha256).length, 6);
  assert.equal(
    manifest.longRecognizer.repository,
    "facebook/wav2vec2-base-960h",
  );
  assert.equal(
    manifest.longRecognizer.revision,
    "22aad52d435eb6dbaf354bdad9b0da84ce7d6156",
  );
  assert.equal(
    manifest.longRecognizer.sourceWeightSha256,
    "8aa76ab2243c81747a1f832954586bc566090c83a0ac167df6f31f0fa917d74a",
  );
  assert.equal(
    manifest.longRecognizer.sourceFilesSha256["model.safetensors"],
    manifest.longRecognizer.sourceWeightSha256,
  );
  assert.equal(
    Object.keys(manifest.longRecognizer.sourceFilesSha256).length,
    6,
  );
  assert.equal(
    manifest.longRecognizer.encoderSha256,
    "b81a5907a87709ff9a83ac87a74473128c76ab3cefa8416bdebd4dbbc1eea931",
  );
  assert.ok(manifest.longRecognizer.encoderBytes < 190_000_000);
  assert.equal(
    manifest.files.filter((f) => f.kind === "long-recognizer").length,
    4,
  );
  assert.ok(
    manifest.files
      .filter((f) => f.kind === "long-recognizer")
      .every((f) => /^recognizer-\d{2}\.bin$/.test(f.path)),
  );

  assert.ok(manifest.encoderBytes < 250_000_000);
  assert.equal(manifest.quantizer.bits, 4);
  assert.equal(manifest.quantizer.blockSize, 32);
  assert.equal(manifest.quantizer.isSymmetric, true);
  assert.equal(manifest.quantizer.accuracyLevel, 0);
  assert.equal(manifest.quantizer.onnxIR, "0.1.16");
  assert.equal(
    manifest.longRecognizer.representation,
    "float16 constant storage; float32 operations",
  );
  const legacyTransports = {
    "recognizer-00.bin":
      "cf330aab35a54022e1d69ccf4f03c16141a6c21a39790465e1859ce8b3107ac4",
    "recognizer-01.bin":
      "ddd34c66a2a5f126d46f3fc9d8ab3f602dc6659800d6e74580cd4162d60d554a",
    "recognizer-02.bin":
      "948503bcee42568af8adc5240113dfcbbcd61ab0ccdbfdfe9eb6676be2a3e2f2",
    "recognizer-03.bin":
      "c79d614f06dfd00941018c2b810ad7b572af5fe65333b077901a6defa58346bb",
  };
  for (const file of manifest.files.filter((f) => f.kind === "long-recognizer"))
    assert.equal(
      file.transport.sha256,
      legacyTransports[file.path],
      "original base URLs must retain their published bytes",
    );

  assert.ok(
    manifest.files
      .filter((f) => f.kind === "recognizer")
      .every((f) => /^recognizer-lv60-int4-\d{2}\.bin$/.test(f.path)),
    "new model URLs cannot overwrite base-model cache entries",
  );
  assert.equal(
    manifest.sourceLoaderSha256,
    sha(await readFile("training/recognition_model.py")),
  );
  assert.equal(
    manifest.exporterSha256,
    sha(await readFile("training/export_recognition.py")),
  );
  assert.equal(
    manifest.referenceExporterSha256,
    sha(await readFile("training/export_word_references.py")),
  );
  assert.equal(
    manifest.transportPackerSha256,
    sha(await readFile("scripts/pack-models.mjs")),
  );
  assert.equal(
    manifest.totalDownloadBytes,
    manifest.files.reduce((n, f) => n + (f.transport?.bytes || f.bytes), 0),
  );
  assert.ok(manifest.totalDownloadBytes < manifest.totalBytes * 0.9);
  let total = 0;
  const encoder = createHash("sha256");
  const longEncoder = createHash("sha256");
  for (const f of manifest.files) {
    const bytes = await decoded(dir, f);
    assert.equal(bytes.length, f.bytes);
    assert.equal(sha(bytes), f.sha256, f.path);
    assert.ok(f.bytes <= 48 * 1024 * 1024);
    total += f.bytes;
    if (f.kind === "recognizer") encoder.update(bytes);
    if (f.kind === "long-recognizer") longEncoder.update(bytes);
  }
  assert.equal(total, manifest.totalBytes);
  assert.equal(encoder.digest("hex"), manifest.encoderSha256);
  assert.equal(
    longEncoder.digest("hex"),
    manifest.longRecognizer.encoderSha256,
  );
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
  assert.equal(
    manifest.transportPackerSha256,
    sha(await readFile("scripts/pack-models.mjs")),
  );
  assert.equal(
    manifest.totalDownloadBytes,
    manifest.files.reduce((n, f) => n + (f.transport?.bytes || f.bytes), 0),
  );
  assert.ok(manifest.totalDownloadBytes < manifest.totalBytes * 0.9);
  let total = 0;
  const encoder = createHash("sha256");
  for (const file of manifest.files) {
    const bytes = await decoded(directory, file);
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
