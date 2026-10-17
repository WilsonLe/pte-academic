import {
  comparisonWorkerUrl,
  comparisonRuntimeFiles,
} from "./comparison-runtime";
import { decodeRecording } from "./audio";
import {
  prepareComparisonModel,
  modelBase,
  invalidateComparisonModel,
} from "./comparison-assets";
import {
  COMPARISON_MAX_SECONDS,
  RECOGNITION_MAX_SECONDS,
  pronunciationSchema,
  type Pronunciation,
} from "./comparison-schema";
import type { SyllableTarget } from "./comparison-core";
import { loadSyllableReferences } from "./word-reference";
let occupied = false;
export function scoreRecording(
  url: string,
  text: string,
  onProgress: (message: string) => void,
  target?: SyllableTarget,
  recognize = false,
) {
  let aborted = false,
    worker: Worker | undefined,
    rejectJob: ((e: Error) => void) | undefined;
  const abort = new AbortController();
  const cancelled = () => new DOMException("Scoring cancelled", "AbortError");
  const promise = (async (): Promise<Pronunciation> => {
    if (occupied)
      throw new Error(
        "Another syllable comparison is running. Finish or cancel it first.",
      );
    occupied = true;
    try {
      if (!url.startsWith("blob:"))
        throw new Error("Only a local recording can be scored.");
      if (typeof Worker === "undefined" || typeof WebAssembly === "undefined")
        throw new Error("Local speech grading is unavailable in this browser.");
      onProgress("Preparing required speech model…");
      await new Promise<void>((resolve, reject) => {
        const stop = () => reject(cancelled());
        abort.signal.addEventListener("abort", stop, { once: true });
        prepareComparisonModel(false, comparisonRuntimeFiles)
          .then(resolve, reject)
          .finally(() => abort.signal.removeEventListener("abort", stop));
      });
      if (aborted) throw cancelled();
      onProgress("Reading recording…");
      const response = await fetch(url, { signal: abort.signal });
      const audio = await decodeRecording(await response.blob());
      if (aborted) throw cancelled();
      if (
        audio.length / 16000 >
        (recognize ? RECOGNITION_MAX_SECONDS : COMPARISON_MAX_SECONDS)
      )
        throw new Error(
          `Speech feedback supports recordings up to ${recognize ? RECOGNITION_MAX_SECONDS : COMPARISON_MAX_SECONDS} seconds.`,
        );
      if (target?.word) onProgress("Preparing syllable reference audio…");
      const references = target?.word
        ? await loadSyllableReferences(
            target.word,
            target.syllableIndex,
            target.syllableCount,
            abort.signal,
          )
        : [];
      if (aborted) throw cancelled();
      worker = new Worker(comparisonWorkerUrl, {
        type: "module",
      });
      return await new Promise<Pronunciation>((resolve, reject) => {
        const timeout = setTimeout(
          () =>
            fail(
              new Error(
                "Speech comparison took too long. Your recording is retained; retry on a faster device.",
              ),
            ),
          5 * 60_000,
        );
        const fail = (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        };
        rejectJob = fail;
        worker!.onerror = () =>
          fail(
            new Error(
              "The local comparison worker could not start. Reload or try another browser.",
            ),
          );
        worker!.onmessage = (event) => {
          if (aborted) return;
          const data = event.data;
          if (data.type === "progress") onProgress(String(data.message));
          else if (data.type === "error") {
            const message = String(data.message);
            if (data.code === "model-assets")
              invalidateComparisonModel(message);
            fail(new Error(message));
          } else if (data.type === "complete") {
            const checked = pronunciationSchema.safeParse(data.result);
            clearTimeout(timeout);
            if (checked.success) resolve(checked.data);
            else
              reject(
                new Error("The comparison model returned an invalid result."),
              );
          }
        };
        worker!.postMessage(
          { audio, text, target, recognize, references, base: modelBase() },
          [audio.buffer, ...references.map((r) => r.audio.buffer)],
        );
      });
    } finally {
      worker?.terminate();
      occupied = false;
    }
  })();
  return {
    promise,
    cancel: () => {
      aborted = true;
      abort.abort();
      worker?.terminate();
      rejectJob?.(cancelled());
    },
  };
}
