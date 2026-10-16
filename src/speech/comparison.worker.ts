import * as ort from "onnxruntime-web/wasm";
import wasmUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url";
import factoryUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url";
import {
  comparisonManifest,
  verifiedAsset,
  verifiedRecognitionAsset,
  ModelAssetError,
} from "./comparison-assets";
import {
  logProbabilities,
  normalizedAudio,
  scoreOutputs,
  scriptKey,
  targetVariants,
  type SyllableTarget,
  reliableSignal,
  type ComparisonMetadata,
} from "./comparison-core";
import {
  COMPARISON_EXPORT,
  COMPARISON_MODEL_SHA,
  COMPARISON_MAX_SECONDS,
  RECOGNITION_MAX_SECONDS,
  type Pronunciation,
} from "./comparison-schema";
import recognitionManifest from "./recognition-manifest.json";
import {
  recognizeWords,
  speechWindowBounds,
  scoreRecognizedWords,
  wordVariants,
  type WordLexicon,
} from "./recognition-core";
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = {
  wasm: new URL(wasmUrl, self.location.href).href,
  mjs: new URL(factoryUrl, self.location.href).href,
};
self.onmessage = async (
  event: MessageEvent<{
    audio: Float32Array;
    text: string;
    recognize?: boolean;
    target?: SyllableTarget;
    base: string;
  }>,
) => {
  let session: ort.InferenceSession | undefined;
  const progress = (message: string) =>
    self.postMessage({ type: "progress", message });
  try {
    const { audio, text, target, base, recognize = false } = event.data;
    if (
      !(audio instanceof Float32Array) ||
      !audio.length ||
      audio.length >
        16000 *
          (recognize ? RECOGNITION_MAX_SECONDS : COMPARISON_MAX_SECONDS) ||
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
    if (recognize)
      result.recognition = { modelId: "audio-only-words-v1", words: [] };
    if (!reliableSignal(audio)) {
      result.status = "no-reliable-speech";
      self.postMessage({ type: "complete", result });
      return;
    }
    progress("Checking local v3 model…");
    const metadata = JSON.parse(
      new TextDecoder().decode(await verifiedAsset("comparison.json", base)),
    ) as ComparisonMetadata;
    const lexicon =
      recognize || target?.word
        ? (JSON.parse(
            new TextDecoder().decode(
              await verifiedRecognitionAsset("lexicon.json", base),
            ),
          ) as WordLexicon)
        : undefined;
    const expected = target?.word || text;
    if (target?.word)
      metadata.scripts[scriptKey(expected)] = wordVariants(
        target.word,
        lexicon!,
        target.wordIndex,
      );
    if (
      metadata.modelSha256 !== COMPARISON_MODEL_SHA ||
      (!recognize && !metadata.scripts[scriptKey(expected)]?.length)
    )
      throw new Error("This reference text is not supported by the v3 model.");
    if (target)
      metadata.scripts[scriptKey(expected)] = targetVariants(
        metadata.scripts[scriptKey(expected)],
        target,
      );
    // Bounded overlapping windows also support open speaking tasks without text.
    const windows: {
      start: number;
      end: number;
      keepStart: number;
      keepEnd: number;
    }[] = [];
    if (recognize)
      for (let at = 0; at < audio.length; at += 20 * 16000) {
        const start = Math.max(0, at - 16000),
          end = Math.min(audio.length, at + 21 * 16000);
        const bounds = speechWindowBounds(audio.subarray(start, end));
        if (!bounds) continue;
        windows.push({
          start: start + bounds.start,
          end: start + bounds.end,
          keepStart: at / 16000,
          keepEnd: Math.min(audio.length, at + 20 * 16000) / 16000,
        });
      }
    const load = async (wordModel: boolean) => {
      const pack = wordModel ? recognitionManifest : comparisonManifest;
      const bytes = new Uint8Array(pack.encoderBytes);
      let at = 0;
      for (const part of pack.files.filter(
        (f) => f.kind === (wordModel ? "recognizer" : "encoder"),
      )) {
        const chunk = await (
          wordModel ? verifiedRecognitionAsset : verifiedAsset
        )(part.path, base);
        bytes.set(chunk, at);
        at += chunk.length;
      }
      return ort.InferenceSession.create(bytes, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
    };
    if (recognize) {
      progress("Recognising words on this device…");
      const vocab = JSON.parse(
        new TextDecoder().decode(
          await verifiedRecognitionAsset("vocab.json", base),
        ),
      );
      session = await load(true);
      for (const window of windows) {
        const samples = audio.subarray(window.start, window.end);
        if (!reliableSignal(samples)) continue;
        const out = await session.run({
          input_values: new ort.Tensor("float32", normalizedAudio(samples), [
            1,
            samples.length,
          ]),
        });
        const values = recognizeWords(
          out.logits.data as Float32Array,
          vocab,
          samples.length / 16000,
        );
        for (const word of values) {
          word.start += window.start / 16000;
          word.end += window.start / 16000;
          const middle = (word.start + word.end) / 2;
          if (middle < window.keepStart || middle >= window.keepEnd) continue;
          const previous = result.recognition!.words.at(-1);
          if (previous && previous.end > word.start) {
            const edge = (previous.end + word.start) / 2;
            previous.end = edge;
            word.start = edge;
          }
          word.index = result.recognition!.words.length;
          result.recognition!.words.push(word);
        }
      }
      await session.release();
      session = undefined;
      if (!result.recognition!.words.length) {
        self.postMessage({ type: "complete", result });
        return;
      }
    }
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
    if (recognize) {
      for (const window of windows) {
        const samples = audio.subarray(window.start, window.end),
          offset = window.start / 16000;
        const words = result.recognition!.words.filter((w) => {
          const mid = (w.start + w.end) / 2;
          return mid >= window.keepStart && mid < window.keepEnd;
        });
        if (!words.length) continue;
        const out = await session.run({
          input_values: new ort.Tensor("float32", normalizedAudio(samples), [
            1,
            samples.length,
          ]),
        });
        const localWords = words.map((w) => ({
          ...w,
          start: w.start - offset,
          end: w.end - offset,
        }));
        const grades = scoreRecognizedWords(
          samples,
          out.hidden7.data as Float32Array,
          logProbabilities(
            out.logits.data as Float32Array,
            Object.keys(metadata.vocab).length,
          ),
          localWords,
          lexicon!,
          metadata,
        );
        localWords.forEach((w, i) => {
          words[i].status = w.status;
        });
        result.syllables.push(
          ...grades.map((s) => ({
            ...s,
            start: s.start + offset,
            end: s.end + offset,
          })),
        );
      }
    } else {
      const input = new ort.Tensor("float32", normalizedAudio(audio), [
        1,
        audio.length,
      ]);
      const output = await session.run({ input_values: input });
      const hidden = output.hidden7.data as Float32Array,
        logits = output.logits.data as Float32Array;
      result.syllables = scoreOutputs(
        audio,
        expected,
        hidden,
        logProbabilities(logits, Object.keys(metadata.vocab).length),
        metadata,
      );
    }
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
