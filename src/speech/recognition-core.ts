import {
  scoreOutputs,
  type ComparisonMetadata,
  type Variant,
} from "./comparison-core";
import type { Pronunciation } from "./comparison-schema";

export type RecognizedWord = {
  word: string;
  index: number;
  start: number;
  end: number;
  confidence: number;
  status: "recognized" | "uncertain" | "unsupported";
};
export type WordLexicon = Record<string, string[][]>;

/** Retain 200ms of acoustic context without running attention over long silence. */
export function speechWindowBounds(audio: Float32Array) {
  let first = -1,
    last = 0;
  for (let at = 0; at < audio.length; at += 400) {
    const end = Math.min(audio.length, at + 400);
    let energy = 0;
    for (let i = at; i < end; i++) energy += audio[i] ** 2;
    if (energy / (end - at) >= 1e-10) {
      if (first < 0) first = at;
      last = end;
    }
  }
  return first < 0
    ? undefined
    : {
        start: Math.max(0, first - 3200),
        end: Math.min(audio.length, last + 3200),
      };
}

/** Greedy character CTC decoding. This API deliberately has no text argument. */
export function recognizeWords(
  logits: Float32Array,
  vocab: Record<string, number>,
  seconds: number,
): RecognizedWord[] {
  const width = Object.keys(vocab).length;
  if (!width || logits.length % width || seconds <= 0)
    throw new Error("Invalid recognition output.");
  const inverse = Object.fromEntries(
    Object.entries(vocab).map(([s, n]) => [n, s]),
  );
  const frames = logits.length / width;
  const words: RecognizedWord[] = [];
  let text = "",
    first = 0,
    last = 0,
    total = 0,
    count = 0,
    previous = -1;
  const flush = () => {
    if (/^[a-z]+(?:'[a-z]+)?$/.test(text) && text.length <= 100) {
      words.push({
        word: text,
        index: words.length,
        start: Math.max(0, (first / frames) * seconds - 0.1),
        end: Math.min(seconds, ((last + 1) / frames) * seconds + 0.12),
        confidence: total / count,
        status: "recognized",
      });
    }
    text = "";
    total = 0;
    count = 0;
  };
  for (let t = 0; t < frames; t++) {
    let best = 0;
    for (let j = 1; j < width; j++)
      if (logits[t * width + j] > logits[t * width + best]) best = j;
    if (best !== previous && best !== vocab["<pad>"]) {
      const token = inverse[best];
      if (token === "|") flush();
      else if (/^[A-Z']$/.test(token || "")) {
        if (!text) first = t;
        last = t;
        text += token.toLowerCase();
        let denominator = 0;
        for (let j = 0; j < width; j++)
          denominator += Math.exp(
            logits[t * width + j] - logits[t * width + best],
          );
        total += 1 / denominator;
        count++;
      }
    }
    previous = best;
  }
  flush();
  // Adjacent clips meet in the gap instead of overlapping another word.
  for (let i = 1; i < words.length; i++) {
    if (words[i - 1].end > words[i].start) {
      const midpoint = (words[i - 1].end + words[i].start) / 2;
      words[i - 1].end = midpoint;
      words[i].start = midpoint;
    }
  }
  return words;
}

export function wordVariants(
  word: string,
  lexicon: WordLexicon,
  wordIndex = 0,
): Variant[] {
  return (Object.hasOwn(lexicon, word) ? lexicon[word] : []).map(
    (labels, variant) => {
      const phones: string[] = [];
      return {
        language: variant ? "en-gb" : "en-us",
        syllables: labels.map((label, syllableIndex) => {
          const phonemes = label.split(" "),
            offset = phones.length;
          phones.push(...phonemes);
          return {
            word,
            wordIndex,
            syllableIndex,
            phonemes,
            phoneIndexes: phonemes.map((_, i) => offset + i),
          };
        }),
        phones,
      };
    },
  );
}

/** Phonetic grading happens only after audio-only recognition, per word window. */
export function scoreRecognizedWords(
  audio: Float32Array,
  hidden: Float32Array,
  logs: Float32Array,
  words: RecognizedWord[],
  lexicon: WordLexicon,
  meta: ComparisonMetadata,
) {
  const width = Object.keys(meta.vocab).length,
    frames = logs.length / width;
  const scale = audio.length / 16000 / frames;
  const syllables: Pronunciation["syllables"] = [];
  for (const word of words) {
    const variants = wordVariants(word.word, lexicon, word.index);
    if (!variants.length) {
      word.status = "unsupported";
      continue;
    }
    if (word.confidence < 0.4) {
      word.status = "uncertain";
      continue;
    }
    const start = Math.max(0, Math.floor(word.start / scale)),
      end = Math.min(frames, Math.ceil(word.end / scale));
    try {
      const spanAudio = audio.subarray(
        Math.floor(start * scale * 16000),
        Math.min(audio.length, Math.ceil(end * scale * 16000)),
      );
      const values = scoreOutputs(
        spanAudio,
        word.word,
        hidden.subarray(start * 1024, end * 1024),
        logs.subarray(start * width, end * width),
        { ...meta, scripts: { [word.word]: variants } },
      );
      syllables.push(
        ...values.map((s) => ({
          ...s,
          start: start * scale + s.start,
          end: Math.min(audio.length / 16000, start * scale + s.end),
        })),
      );
    } catch {
      word.status = "uncertain";
    }
  }
  return syllables;
}
