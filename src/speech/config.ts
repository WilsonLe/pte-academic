export const SPEECH_MODEL = "onnx-community/whisper-tiny.en";
export const SPEECH_REVISION = "2575352d61be1bf7225cf8f8b268a4678025fc58";
export const SPEECH_ENGINE = "transformers.js-4.3.1/whisper-q8-wasm";
export const SAMPLE_RATE = 16_000;
// Five seconds of tolerance around the longest two-minute speaking task.
export const MAX_AUDIO_SECONDS = 125;
export const MAX_RECORDING_BYTES = 24 * 1024 * 1024;
