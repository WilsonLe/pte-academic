import {
  comparisonWorkerUrl,
  comparisonRuntimeFiles,
} from "./comparison-runtime";
import { decodeRecording } from "./client";
import { prepareComparisonModel, modelBase } from "./comparison-assets";
import {
  COMPARISON_MAX_SECONDS,
  pronunciationSchema,
  type Pronunciation,
} from "./comparison-schema";
let occupied = false;
export function scoreRecording(
  url: string,
  text: string,
  onProgress: (message: string) => void,
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
      if (audio.length / 16000 > COMPARISON_MAX_SECONDS)
        throw new Error(
          "Syllable comparison supports recordings up to 45 seconds.",
        );
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
          else if (data.type === "error") fail(new Error(String(data.message)));
          else if (data.type === "complete") {
            const checked = pronunciationSchema.safeParse(data.result);
            clearTimeout(timeout);
            if (checked.success) resolve(checked.data);
            else
              reject(
                new Error("The comparison model returned an invalid result."),
              );
          }
        };
        worker!.postMessage({ audio, text, base: modelBase() }, [audio.buffer]);
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
