const SAMPLE_RATE = 16_000;
const MAX_AUDIO_SECONDS = 125;
const MAX_RECORDING_BYTES = 24 * 1024 * 1024;

export async function decodeRecording(blob: Blob): Promise<Float32Array> {
  if (blob.size > MAX_RECORDING_BYTES)
    throw new Error("This recording is too large. Try a shorter response.");
  if (
    typeof AudioContext === "undefined" ||
    typeof OfflineAudioContext === "undefined"
  )
    throw new Error(
      "Local audio decoding is unavailable in this browser. Replay your recording for self-review.",
    );
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData(await blob.arrayBuffer());
  } finally {
    await context.close();
  }
  if (!decoded.duration || decoded.duration > MAX_AUDIO_SECONDS)
    throw new Error(
      "Local audio decoding supports recordings up to two minutes. Replay this recording for self-review.",
    );
  const offline = new OfflineAudioContext(
    1,
    Math.ceil(decoded.duration * SAMPLE_RATE),
    SAMPLE_RATE,
  );
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  return (await offline.startRendering()).getChannelData(0);
}
