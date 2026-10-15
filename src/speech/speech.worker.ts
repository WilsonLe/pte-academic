import {
  env,
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
} from "@huggingface/transformers";
import wasmUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url";
import factoryUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url";
import {
  SPEECH_MODEL,
  SPEECH_REVISION,
  SPEECH_ENGINE,
  SAMPLE_RATE,
  MAX_AUDIO_SECONDS,
} from "./config";
import type { Transcription } from "./scoring";
env.allowLocalModels = false;
// Pipeline discovery in 4.3.1 does not pass revision to metadata/config probes.
// Pin the URL template too, so every probe and weight request uses this revision.
env.remotePathTemplate = "{model}/resolve/" + SPEECH_REVISION + "/";
env.useBrowserCache = true;
env.useFSCache = false;
env.useWasmCache = false;
env.cacheKey = `pte-speech-model-v1:${new URL("../", self.location.href).href}`;
const wasm = env.backends.onnx.wasm!;
wasm.numThreads = 1;
wasm.proxy = false;
wasm.wasmPaths = {
  wasm: new URL(wasmUrl, self.location.href).href,
  mjs: new URL(factoryUrl, self.location.href).href,
};
// Model requests can only retrieve public files; no recording or transcript can be posted.
env.fetch = (input, init) => {
  const method = (init?.method || "GET").toUpperCase();
  const url = new URL(String(input));
  if (
    !["GET", "HEAD"].includes(method) ||
    url.origin !== "https://huggingface.co" ||
    !url.pathname.startsWith(`/${SPEECH_MODEL}/resolve/${SPEECH_REVISION}/`)
  )
    throw new Error(
      "Unexpected model request: " + url.origin + url.pathname + " " + method,
    );
  return fetch(input, { ...init, credentials: "omit" });
};
let transcriber: AutomaticSpeechRecognitionPipeline | undefined;
self.onmessage = async (event: MessageEvent<{ audio: Float32Array }>) => {
  try {
    const audio = event.data.audio;
    if (
      !(audio instanceof Float32Array) ||
      audio.length === 0 ||
      audio.length > SAMPLE_RATE * MAX_AUDIO_SECONDS
    )
      throw new Error("Invalid recording length");
    if (!transcriber)
      transcriber = await pipeline(
        "automatic-speech-recognition",
        SPEECH_MODEL,
        {
          revision: SPEECH_REVISION,
          device: "wasm",
          dtype: "q8",
          progress_callback: (progress) => {
            if (progress.status === "progress_total")
              self.postMessage({
                type: "progress",
                message: `Downloading speech model · ${Math.floor(progress.progress)}%`,
              });
            else if (progress.status === "initiate")
              self.postMessage({
                type: "progress",
                message: "Loading speech model…",
              });
          },
        },
      );
    self.postMessage({
      type: "progress",
      message: "Transcribing on this device…",
    });
    const output = await transcriber(audio, {
      chunk_length_s: 25,
      stride_length_s: 4,
      max_new_tokens: 128,
      do_sample: false,
    });
    const result: Transcription = {
      text: output.text.trim(),
      seconds: audio.length / SAMPLE_RATE,
      engine: SPEECH_ENGINE,
      model: SPEECH_MODEL,
      revision: SPEECH_REVISION,
    };
    self.postMessage({ type: "complete", result });
  } catch {
    self.postMessage({
      type: "error",
      message:
        "Transcription could not finish. Check your connection for the first model download, or retry on a device with more memory. Your recording is still available.",
    });
  }
};
