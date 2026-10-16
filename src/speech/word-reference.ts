import { verifiedRecognitionAsset } from "./comparison-assets";
import type { Pronunciation } from "./comparison-schema";

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
      await verifiedRecognitionAsset("word-references.json"),
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
  const bytes = await verifiedRecognitionAsset(reference.audio);
  return {
    ...reference,
    audio: URL.createObjectURL(
      new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "audio/mpeg" }),
    ),
  };
}
