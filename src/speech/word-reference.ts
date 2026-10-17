import { verifiedReferenceAsset } from "./comparison-assets";
import type { Pronunciation } from "./comparison-schema";
import { decodeRecording } from "./audio";
import type { SyllableReferenceInput } from "./comparison-core";

export type ReferenceSyllable = Pick<
  Pronunciation["syllables"][number],
  "word" | "wordIndex" | "syllableIndex" | "label" | "start" | "end"
>;
type Reference = {
  accent: string;
  audio: string;
  start: number;
  end: number;
  synthetic: true;
  listeningStatus: string;
  syllables: ReferenceSyllable[];
};
/** Returns a verified, local word reference from training audio, never a prompt. */
export async function loadWordReference(word: string, labels: string[]) {
  const index = JSON.parse(
    new TextDecoder().decode(
      await verifiedReferenceAsset("word-references.json"),
    ),
  ) as { words: Record<string, Reference[]> };
  const values = Object.hasOwn(index.words, word) ? index.words[word] : [];
  const reference =
    values.find(
      (r) => r.syllables.map((s) => s.label).join("|") === labels.join("|"),
    ) ||
    values.find((r) => r.syllables.length === labels.length) ||
    values[0];
  if (!reference) return undefined;
  const bytes = await verifiedReferenceAsset(reference.audio);
  return {
    ...reference,
    audio: URL.createObjectURL(
      new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "audio/mpeg" }),
    ),
  };
}

/** Decode only a selected, verified reference interval to the worker's rate. */
export async function loadSyllableReferences(
  word: string,
  index: number,
  count?: number,
  signal?: AbortSignal,
): Promise<SyllableReferenceInput[]> {
  const library = JSON.parse(
    new TextDecoder().decode(
      await verifiedReferenceAsset("word-references.json"),
    ),
  ) as { words: Record<string, Reference[]> };
  const refs = Object.hasOwn(library.words, word) ? library.words[word] : [];
  const result: SyllableReferenceInput[] = [];
  for (const ref of refs.slice(0, 4)) {
    if (count !== undefined && ref.syllables.length !== count) continue;
    const syllable = ref.syllables.find((s) => s.syllableIndex === index);
    if (!syllable) continue;
    const bytes = await verifiedReferenceAsset(ref.audio);
    const context = new AudioContext({ sampleRate: 48000 });
    try {
      const decoded = await context.decodeAudioData(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
      );
      result.push({
        accent: ref.accent,
        label: syllable.label,
        audio: await throughRecordingCodec(
          decoded
            .getChannelData(0)
            .slice(
              Math.floor(syllable.start * 48000),
              Math.ceil(syllable.end * 48000),
            ),
          signal,
        ),
      });
    } finally {
      await context.close();
    }
  }
  return result;
}

/** Match the browser's recording codec using synthetic audio only, no microphone. */
async function throughRecordingCodec(
  audio: Float32Array,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const context = new AudioContext({ sampleRate: 48000 });
  const destination = context.createMediaStreamDestination();
  const source = context.createBufferSource();
  source.buffer = context.createBuffer(1, audio.length, 48000);
  source.buffer.copyToChannel(audio as Float32Array<ArrayBuffer>, 0);
  source.connect(destination);
  const recorder = new MediaRecorder(destination.stream);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: () => void = () => {};
  try {
    await context.resume();
    const blob = await new Promise<Blob>((resolve, reject) => {
      const chunks: BlobPart[] = [];
      cancel = () =>
        reject(
          signal?.reason ?? new DOMException("Scoring cancelled", "AbortError"),
        );
      signal?.addEventListener("abort", cancel, { once: true });
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onerror = () =>
        reject(new Error("Reference audio encoding failed."));
      recorder.onstop = () =>
        resolve(new Blob(chunks, { type: recorder.mimeType }));
      recorder.start();
      source.start(context.currentTime + 0.25);
      timer = setTimeout(
        () => recorder.stop(),
        (audio.length / 48000 + 1) * 1000,
      );
      if (signal?.aborted) cancel();
    });
    signal?.throwIfAborted();
    return await decodeRecording(blob);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
    if (recorder.state === "recording") recorder.stop();
    destination.stream.getTracks().forEach((t) => t.stop());
    await context.close();
  }
}
