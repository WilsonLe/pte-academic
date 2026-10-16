// Main-thread-only URLs: keeping these out of the worker's cache module avoids
// recursively bundling a worker that imports its own worker URL.
import workerUrl from "./comparison.worker.ts?worker&url";
import wasmUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url";
import factoryUrl from "../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url";
export const comparisonWorkerUrl = workerUrl;
export const comparisonRuntimeFiles = [workerUrl, wasmUrl, factoryUrl];
