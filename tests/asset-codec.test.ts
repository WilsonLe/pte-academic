import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "node:zlib";
import { unpackAsset } from "../src/speech/asset-codec";
import { isolatedAudio } from "../src/speech/comparison-core";
test("lossless transport restores odd-length bytes and rejects truncated/oversized data", async () => {
  const raw = Uint8Array.from({ length: 8193 }, (_, i) => (i * 29) % 256);
  const shuffled = new Uint8Array(raw.length),
    half = Math.ceil(raw.length / 2);
  for (let i = 0; i < half; i++) {
    shuffled[i] = raw[i * 2];
    if (i * 2 + 1 < raw.length) shuffled[half + i] = raw[i * 2 + 1];
  }
  assert.deepEqual(
    await unpackAsset(gzipSync(shuffled), raw.length, "gzip-shuffle2"),
    raw,
  );
  assert.deepEqual(await unpackAsset(gzipSync(raw), raw.length, "gzip"), raw);
  await assert.rejects(unpackAsset(gzipSync(raw), raw.length - 1, "gzip"));
  await assert.rejects(unpackAsset(gzipSync(raw), raw.length + 1, "gzip"));
  await assert.rejects(
    unpackAsset(gzipSync(raw).subarray(0, 10), raw.length, "gzip"),
  );
});
test("isolated comparison keeps sound and uses equal context regardless of recording silence", () => {
  const sound = Float32Array.from(
    { length: 3200 },
    (_, i) => Math.sin(i * 0.14) * 0.4,
  );
  const recording = new Float32Array(48000);
  recording.set(sound, 16000);
  assert.deepEqual(isolatedAudio(sound), isolatedAudio(recording));
  assert.equal(isolatedAudio(new Float32Array(16000)).length, 0);
});
