// The Python comparison.py CTC alignment, feature pooling and trained-head equations.
// No accent/target labels enter projection features; targets only align observed frames.
export type Variant = {
  language: string;
  phones: string[];
  syllables: {
    word: string;
    wordIndex: number;
    syllableIndex: number;
    phonemes: string[];
    phoneIndexes: number[];
  }[];
};
export type ComparisonMetadata = {
  modelSha256: string;
  featureRepresentation: string;
  classes: string[];
  mean: number[];
  std: number[];
  project: Record<string, number[][] | number[]>;
  bank: Record<string, number[][]>;
  calibration: Record<string, [number, number, number]>;
  duration: Record<string, [number, number]>;
  vocab: Record<string, number>;
  scripts: Record<string, Variant[]>;
};
export const scriptKey = (text: string) =>
  (
    text
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .match(/[a-z]+(?:'[a-z]+)?/g) || []
  ).join(" ");
const clip = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const round = (x: number, n = 2) => Math.round(x * 10 ** n) / 10 ** n;
export function normalizedAudio(audio: Float32Array) {
  let mean = 0;
  for (const x of audio) mean += x;
  mean /= audio.length;
  let variance = 0;
  for (const x of audio) variance += (x - mean) ** 2;
  variance /= audio.length;
  const out = new Float32Array(audio.length),
    scale = Math.sqrt(variance + 1e-7);
  for (let i = 0; i < audio.length; i++) out[i] = (audio[i] - mean) / scale;
  return out;
}
export function logProbabilities(logits: Float32Array, width: number) {
  const out = new Float32Array(logits.length);
  for (let i = 0; i < logits.length; i += width) {
    let max = -Infinity,
      total = 0;
    for (let j = 0; j < width; j++) max = Math.max(max, logits[i + j]);
    for (let j = 0; j < width; j++) total += Math.exp(logits[i + j] - max);
    const log = max + Math.log(total);
    for (let j = 0; j < width; j++) out[i + j] = logits[i + j] - log;
  }
  return out;
}
export function alignCTC(logs: Float32Array, width: number, targets: number[]) {
  const frames = logs.length / width,
    size = targets.length * 2 + 1;
  if (
    !targets.length ||
    frames <
      targets.length +
        targets.slice(1).filter((x, i) => x === targets[i]).length
  )
    throw new Error("Not enough speech frames to align this text.");
  const labels = new Int32Array(size);
  targets.forEach((x, i) => (labels[2 * i + 1] = x));
  let scores = new Float32Array(size).fill(-Infinity);
  scores[0] = logs[0];
  scores[1] = logs[targets[0]];
  const back = new Int8Array(frames * size);
  for (let t = 1; t < frames; t++) {
    const next = new Float32Array(size);
    for (let s = 0; s < size; s++) {
      let best = scores[s],
        step = 0;
      if (s > 0 && scores[s - 1] > best) {
        best = scores[s - 1];
        step = 1;
      }
      if (
        s > 1 &&
        labels[s] !== 0 &&
        labels[s] !== labels[s - 2] &&
        scores[s - 2] > best
      ) {
        best = scores[s - 2];
        step = 2;
      }
      next[s] = best + logs[t * width + labels[s]];
      back[t * size + s] = step;
    }
    scores = next;
  }
  let state = scores[size - 1] > scores[size - 2] ? size - 1 : size - 2;
  if (!Number.isFinite(scores[state]))
    throw new Error("No reliable alignment.");
  const states = new Int32Array(frames);
  for (let t = frames - 1; t >= 0; t--) {
    states[t] = state;
    state -= back[t * size + state];
  }
  return targets.map((token, i) => {
    let start = -1,
      end = 0,
      sum = 0,
      count = 0;
    for (let t = 0; t < frames; t++)
      if (states[t] === 2 * i + 1) {
        if (start < 0) start = t;
        end = t + 1;
        sum += logs[t * width + token];
        count++;
      }
    if (!count) throw new Error("A sound could not be aligned.");
    return { start, end, confidence: Math.exp(sum / count) };
  });
}
// erf approximation error <1.5e-7; tested against the persisted Torch projection.
function gelu(x: number) {
  const sign = x < 0 ? -1 : 1,
    z = Math.abs(x) / Math.SQRT2,
    t = 1 / (1 + 0.3275911 * z);
  const erf =
    sign *
    (1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
        t +
        0.254829592) *
        t *
        Math.exp(-z * z));
  return 0.5 * x * (1 + erf);
}
function linear(x: number[], weight: number[][], bias: number[]) {
  return weight.map((row, i) => {
    let sum = bias[i];
    for (let j = 0; j < x.length; j++) sum += row[j] * x[j];
    return sum;
  });
}
function project(x: number[], meta: ComparisonMetadata) {
  const p = meta.project;
  let v = x.map((x, i) => (x - meta.mean[i]) / meta.std[i]);
  v = linear(
    v,
    p["project.0.weight"] as number[][],
    p["project.0.bias"] as number[],
  ).map(gelu);
  v = linear(
    v,
    p["project.2.weight"] as number[][],
    p["project.2.bias"] as number[],
  );
  const norm = Math.max(Math.hypot(...v), 1e-12);
  return v.map((x) => x / norm);
}
export function scoreOutputs(
  audio: Float32Array,
  text: string,
  hidden: Float32Array,
  logs: Float32Array,
  meta: ComparisonMetadata,
  isolatedReferences?: Record<string, number[][]>,
  onEvidence?: (phone: string, projected: number[], confidence: number) => void,
) {
  const variants = meta.scripts[scriptKey(text)];
  if (!variants?.length)
    throw new Error(
      "This text is not supported by the local comparison model.",
    );
  const width = Object.keys(meta.vocab).length,
    frames = logs.length / width,
    hiddenWidth = hidden.length / frames;
  if (hiddenWidth !== 1024 || meta.featureRepresentation !== "hidden-ctc-v1")
    throw new Error("The speech feature version does not match v3.");
  let chosen:
    | {
        variant: Variant;
        spans: ReturnType<typeof alignCTC>;
        confidence: number;
      }
    | undefined;
  for (const variant of variants) {
    try {
      const spans = alignCTC(
        logs,
        width,
        variant.phones.map((p) => meta.vocab[p.replace(/[012]+$/g, "")]),
      );
      const confidence =
        spans.reduce((s, p) => s + Math.log(Math.max(p.confidence, 1e-10)), 0) /
        spans.length;
      if (!chosen || confidence > chosen.confidence)
        chosen = { variant, spans, confidence };
    } catch {
      /* Another supported whole-passage variant may align. */
    }
  }
  if (!chosen)
    throw new Error("No supported pronunciation variant could be aligned.");
  const { variant, spans } = chosen,
    scale = audio.length / 16000 / frames;
  const phones = spans.map((span, i) => {
    const feature = new Array(1024 + width).fill(0);
    for (let t = span.start; t < span.end; t++) {
      for (let j = 0; j < 1024; j++) feature[j] += hidden[t * 1024 + j];
      for (let j = 0; j < width; j++) feature[1024 + j] += logs[t * width + j];
    }
    for (let j = 0; j < feature.length; j++)
      feature[j] /= span.end - span.start;
    const z = project(feature, meta),
      phone = variant.phones[i].replace(/[012]+$/g, ""),
      label = String(meta.classes.indexOf(phone)),
      refs = isolatedReferences ? isolatedReferences[label] : meta.bank[label],
      cal = meta.calibration[label];
    onEvidence?.(phone, z, span.confidence);
    let similarity: number | null = null;
    if (refs?.length && cal) {
      const ds = refs
        .map((row) => 1 - row.reduce((s, v, j) => s + v * z[j], 0))
        .sort((a, b) => a - b);
      // A retry has one compatible template per available reference accent;
      // each is an equally valid target, not a vote against the other accents.
      const k = isolatedReferences ? 1 : Math.min(8, ds.length),
        distance = ds.slice(0, k).reduce((a, b) => a + b, 0) / k;
      similarity = round(
        clip(
          85 - (25 * (distance - cal[0])) / Math.max(cal[1] - cal[0], 1e-4),
          0,
          100,
        ),
      );
    }
    const left =
      i === 0
        ? Math.max(0, span.start - 2)
        : Math.max(
            span.start - 4,
            Math.floor((spans[i - 1].end + span.start) / 2),
          );
    const right =
      i + 1 === spans.length
        ? Math.min(frames, span.end + 2)
        : Math.min(
            span.end + 4,
            Math.floor((span.end + spans[i + 1].start) / 2),
          );
    return {
      similarity,
      confidence: span.confidence,
      start: left * scale,
      end: Math.max(left + 1, right) * scale,
    };
  });
  return variant.syllables.map((s) => {
    const ps = s.phoneIndexes.map((i) => phones[i]),
      confidence = ps.reduce((v, p) => v + p.confidence, 0) / ps.length;
    const valid =
      ps.every(
        (p) =>
          p.similarity !== null &&
          (!isolatedReferences || p.confidence >= 0.03),
      ) && confidence >= 0.03;
    return {
      word: s.word,
      wordIndex: s.wordIndex,
      syllableIndex: s.syllableIndex,
      label: s.phonemes.join(" "),
      start: ps[0].start,
      end: ps[ps.length - 1].end,
      similarity: valid
        ? round(ps.reduce((v, p) => v + p.similarity!, 0) / ps.length)
        : null,
      confidence: round(confidence, 3),
      status: valid ? ("scored" as const) : ("uncertain" as const),
    };
  });
}
// Windowed spectral-flatness guard keeps broadband noise from receiving a grade.
export function reliableSignal(audio: Float32Array) {
  if (audio.length < 1600) return false;
  let energy = 0;
  for (const x of audio) energy += x * x;
  if (Math.sqrt(energy / audio.length) < 1e-5) return false;
  const flatness: number[] = [];
  for (let offset = 0; offset + 400 <= audio.length; offset += 400) {
    let windowEnergy = 0;
    for (let j = 0; j < 400; j++) windowEnergy += audio[offset + j] ** 2;
    // Silence must not dominate the spectral median in a response with pauses.
    if (windowEnergy / 400 < 1e-10) continue;
    const re = new Float64Array(512),
      im = new Float64Array(512);
    for (let j = 0; j < 400; j++)
      re[j] =
        audio[offset + j] * (0.5 - 0.5 * Math.cos((2 * Math.PI * j) / 399));
    for (let i = 1, j = 0; i < 512; i++) {
      let bit = 256;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) [re[i], re[j]] = [re[j], re[i]];
    }
    for (let length = 2; length <= 512; length *= 2) {
      const angle = (-2 * Math.PI) / length;
      for (let start = 0; start < 512; start += length) {
        for (let j = 0; j < length / 2; j++) {
          const c = Math.cos(angle * j),
            s = Math.sin(angle * j),
            a = start + j,
            b = a + length / 2,
            vr = re[b] * c - im[b] * s,
            vi = re[b] * s + im[b] * c;
          re[b] = re[a] - vr;
          im[b] = im[a] - vi;
          re[a] += vr;
          im[a] += vi;
        }
      }
    }
    let sum = 0,
      log = 0;
    for (let k = 0; k <= 256; k++) {
      const p = re[k] ** 2 + im[k] ** 2 + 1e-12;
      sum += p;
      log += Math.log(p);
    }
    flatness.push(Math.exp(log / 257) / (sum / 257));
  }
  if (!flatness.length) return false;
  flatness.sort((a, b) => a - b);
  const mid = Math.floor(flatness.length / 2),
    median =
      flatness.length % 2
        ? flatness[mid]
        : (flatness[mid - 1] + flatness[mid]) / 2;
  return median < 0.35;
}

export type SyllableTarget = {
  word?: string;
  wordIndex: number;
  syllableIndex: number;
  syllableCount?: number;
};

export type SyllableReferenceInput = {
  accent: string;
  label: string;
  audio: Float32Array;
};

/** Remove recorder waiting time, then give both short inputs identical context. */
export function isolatedAudio(audio: Float32Array) {
  const step = 160;
  const energies: number[] = [];
  for (let at = 0; at < audio.length; at += step) {
    let energy = 0;
    const end = Math.min(audio.length, at + step);
    for (let i = at; i < end; i++) energy += audio[i] ** 2;
    energies.push(Math.sqrt(energy / (end - at)));
  }
  const peak = Math.max(0, ...energies);
  const threshold = Math.max(1e-5, peak * 0.04);
  const first = energies.findIndex((e) => e >= threshold);
  let last = energies.length - 1;
  while (last >= 0 && energies[last] < threshold) last--;
  if (first < 0) return new Float32Array(0);
  const start = Math.max(0, first * step);
  const end = Math.min(audio.length, (last + 1) * step);
  const result = new Float32Array(end - start + 6400);
  result.set(audio.subarray(start, end), 3200);
  return result;
}
/** Reuse every supported whole-passage variant, selecting only its target sounds. */
export function targetVariants(variants: Variant[], target: SyllableTarget) {
  if (
    !Number.isInteger(target.wordIndex) ||
    target.wordIndex < 0 ||
    !Number.isInteger(target.syllableIndex) ||
    target.syllableIndex < 0 ||
    (target.syllableCount !== undefined &&
      (!Number.isInteger(target.syllableCount) || target.syllableCount < 1))
  )
    throw new Error("Invalid syllable target.");
  const selected = variants.flatMap((variant) => {
    if (
      target.syllableCount !== undefined &&
      variant.syllables.filter((s) => s.wordIndex === target.wordIndex)
        .length !== target.syllableCount
    )
      return [];
    const syllable = variant.syllables.find(
      (s) =>
        s.wordIndex === target.wordIndex &&
        s.syllableIndex === target.syllableIndex,
    );
    if (!syllable) return [];
    return [
      {
        language: variant.language,
        phones: syllable.phoneIndexes.map((i) => variant.phones[i]),
        syllables: [
          { ...syllable, phoneIndexes: syllable.phoneIndexes.map((_, i) => i) },
        ],
      },
    ];
  });
  if (!selected.length)
    throw new Error("This syllable is not supported by the local model.");
  return selected;
}
