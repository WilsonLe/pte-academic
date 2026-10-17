// Keep retry eligibility consistent with the runner's local silence cutoff.
export function hasMicrophoneActivity(samples: Float32Array) {
  if (!samples.length) return false;
  const rms = Math.sqrt(
    samples.reduce((energy, sample) => energy + sample * sample, 0) /
      samples.length,
  );
  return rms > 0.012;
}

/** Check 20 ms windows of decoded 16 kHz audio, preserving brief syllables. */
export function hasRecordedMicrophoneActivity(audio: Float32Array) {
  for (let offset = 0; offset < audio.length; offset += 320) {
    if (hasMicrophoneActivity(audio.subarray(offset, offset + 320)))
      return true;
  }
  return false;
}
