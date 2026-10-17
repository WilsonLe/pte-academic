import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasMicrophoneActivity,
  hasRecordedMicrophoneActivity,
} from "../src/microphone-activity";

test("empty, silent and nonzero room-level recordings have no microphone activity", () => {
  assert.equal(hasMicrophoneActivity(new Float32Array()), false);
  assert.equal(hasRecordedMicrophoneActivity(new Float32Array(16000)), false);
  const quiet = Float32Array.from(
    { length: 128000 },
    (_, i) => 0.002 * Math.sin((2 * Math.PI * 440 * i) / 16000),
  );
  assert.equal(hasRecordedMicrophoneActivity(quiet), false);
});

test("a brief audible syllable counts without averaging it into recorder waiting time", () => {
  const audio = new Float32Array(128000);
  for (let i = 15920; i < 16400; i++)
    audio[i] = 0.08 * Math.sin((2 * Math.PI * 440 * i) / 16000);
  assert.equal(hasMicrophoneActivity(audio), false);
  assert.equal(hasRecordedMicrophoneActivity(audio), true);
});
