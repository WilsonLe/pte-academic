import * as ort from "onnxruntime-web";
import wasmUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url";
import factoryUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url";
import {
  comparisonManifest,
  verifiedAsset,
  ModelAssetError,
} from "./comparison-assets";
import {
  logProbabilities,
  normalizedAudio,
  scoreOutputs,
  scriptKey,
  reliableSignal,
  type ComparisonMetadata,
} from "./comparison-core";
import {
  COMPARISON_EXPORT,
  COMPARISON_MODEL_SHA,
  COMPARISON_MAX_SECONDS,
  type Pronunciation,
} from "./comparison-schema";
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = {
  wasm: new URL(wasmUrl, self.location.href).href,
  mjs: new URL(factoryUrl, self.location.href).href,
};
self.onmessage = async (
  event: MessageEvent<{ audio: Float32Array; text: string; base: string }>,
) => {
  let session: ort.InferenceSession | undefined;
  const progress = (message: string) =>
    self.postMessage({ type: "progress", message });
  try {
    const { audio, text, base } = event.data;
    if (
      !(audio instanceof Float32Array) ||
      !audio.length ||
      audio.length > 16000 * COMPARISON_MAX_SECONDS ||
      audio.some((x) => !Number.isFinite(x)) ||
      typeof text !== "string" ||
      text.length > 10000 ||
      new URL(base).origin !== self.location.origin
    )
      throw new Error("Unsupported local speech input.");
    const result: Pronunciation = {
      schemaVersion: 1,
      modelSha256: COMPARISON_MODEL_SHA,
      exportId: COMPARISON_EXPORT,
      referenceAccents: ["en-US", "en-GB", "en-AU", "en-IN"],
      seconds: audio.length / 16000,
      status: "unscored",
      syllables: [],
    };
    if (!reliableSignal(audio)) {
      result.status = "no-reliable-speech";
      self.postMessage({ type: "complete", result });
      return;
    }
    progress("Checking local v3 model…");
    const metadata = JSON.parse(
      new TextDecoder().decode(await verifiedAsset("comparison.json", base)),
    ) as ComparisonMetadata;
    if (
      metadata.modelSha256 !== COMPARISON_MODEL_SHA ||
      !metadata.scripts[scriptKey(text)]?.length
    )
      throw new Error("This reference text is not supported by the v3 model.");
    const bytes = new Uint8Array(comparisonManifest.encoderBytes);
    let offset = 0;
    for (const part of comparisonManifest.files.filter(
      (f) => f.kind === "encoder",
    )) {
      const chunk = await verifiedAsset(part.path, base);
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    progress("Loading v3 speech comparison…");
    session = await ort.InferenceSession.create(bytes, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
    progress("Scoring syllables on this device…");
    const input = new ort.Tensor("float32", normalizedAudio(audio), [
      1,
      audio.length,
    ]);
    const output = await session.run({ input_values: input });
    const hidden = output.hidden7.data as Float32Array,
      logits = output.logits.data as Float32Array;
    result.syllables = scoreOutputs(
      audio,
      text,
      hidden,
      logProbabilities(logits, Object.keys(metadata.vocab).length),
      metadata,
    );
    result.status = result.syllables.some((s) => s.status === "scored")
      ? "scored"
      : "unscored";
    self.postMessage({ type: "complete", result });
  } catch (error) {
    self.postMessage({
      type: "error",
      code: error instanceof ModelAssetError ? "model-assets" : undefined,
      message:
        error instanceof Error
          ? error.message
          : "Speech comparison could not finish. Your recording is retained; retry on a device with more memory.",
    });
  } finally {
    await session?.release();
  }
};
