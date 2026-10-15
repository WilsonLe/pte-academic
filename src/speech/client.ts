import {
  MAX_AUDIO_SECONDS,
  MAX_RECORDING_BYTES,
  SAMPLE_RATE,
  SPEECH_ENGINE,
  SPEECH_MODEL,
  SPEECH_REVISION,
} from "./config";
import { transcriptionSchema, type Transcription } from "./scoring";
const cancelled = () =>
  new DOMException("Transcription cancelled", "AbortError");
let occupied = false;
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
      "Local transcription supports recordings up to two minutes. Replay this recording for self-review.",
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
export function transcribeRecording(
  url: string,
  onProgress: (message: string) => void,
) {
  let aborted = false,
    worker: Worker | undefined,
    rejectWorker: ((e: Error) => void) | undefined;
  const abort = new AbortController();
  const promise = (async (): Promise<Transcription> => {
    if (occupied)
      throw new Error(
        "Another transcription is running. Finish or cancel it first.",
      );
    occupied = true;
    try {
      if (typeof Worker === "undefined" || typeof WebAssembly === "undefined")
        throw new Error(
          "On-device transcription is unavailable in this browser. Replay your recording for self-review.",
        );
      if (!url.startsWith("blob:"))
        throw new Error("Only a local recording can be transcribed.");
      onProgress("Reading recording…");
      const response = await fetch(url, { signal: abort.signal });
      const audio = await decodeRecording(await response.blob());
      if (aborted) throw cancelled();
      let energy = 0;
      for (const value of audio) energy += value * value;
      if (Math.sqrt(energy / audio.length) < 0.001)
        return {
          text: "",
          seconds: audio.length / SAMPLE_RATE,
          engine: SPEECH_ENGINE,
          model: SPEECH_MODEL,
          revision: SPEECH_REVISION,
        };
      onProgress("Loading local speech model…");
      worker = new Worker(new URL("./speech.worker.ts", import.meta.url), {
        type: "module",
      });
      return await new Promise<Transcription>((resolve, reject) => {
        rejectWorker = reject;
        const timeout = setTimeout(
          () =>
            reject(
              new Error(
                "Transcription took too long. Retry on a faster device. Your recording is still available.",
              ),
            ),
          5 * 60_000,
        );
        const fail = (e: Error) => {
          clearTimeout(timeout);
          reject(e);
        };
        worker!.onerror = () =>
          fail(
            new Error(
              "The local speech worker could not start. Reload or try another browser.",
            ),
          );
        worker!.onmessage = (event) => {
          if (aborted) return;
          const data = event.data;
          if (data.type === "progress") onProgress(String(data.message));
          else if (data.type === "error") fail(new Error(String(data.message)));
          else if (data.type === "complete") {
            clearTimeout(timeout);
            const checked = transcriptionSchema.safeParse(data.result);
            if (checked.success) resolve(checked.data);
            else
              reject(new Error("The speech model returned an invalid result."));
          }
        };
        worker!.postMessage({ audio }, [audio.buffer]);
        // Cancellation must also release the timeout rather than leave a pending job.
        rejectWorker = (e) => fail(e);
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
      rejectWorker?.(cancelled());
    },
  };
}
