import { syllableSpelling as spelling } from "../content";
import type { Pronunciation } from "./comparison-schema";
type Syllable = Pronunciation["syllables"][number];
export const similarityTone = (value: number | null) =>
  value === null
    ? "uncertain"
    : value >= 75
      ? "close"
      : value >= 50
        ? "developing"
        : "focus";
export const syllableDescription = (s: Syllable) =>
  `Syllable ${s.syllableIndex + 1}: ${s.similarity === null ? "uncertain, no score" : `${Math.round(s.similarity)} out of 100`}`;
export type SyllableLetters = { text: string; syllable?: Syllable };

/** Authored spelling groups visualize syllable scores, never letter-level grades. */
export function syllableLetters(
  display: string,
  syllables: Syllable[],
): SyllableLetters[] {
  const match = /^[a-z]+(?:['’‘][a-z]+)?/i.exec(display);
  if (!match || !syllables.length) return [{ text: display }];
  const word = match[0].toLowerCase().replace(/[’‘]/g, "'");
  const ordered = [...syllables].sort(
    (a, b) => a.syllableIndex - b.syllableIndex,
  );
  if (
    !ordered.every(
      (s, i) => s.syllableIndex === i && s.word.toLowerCase() === word,
    )
  )
    return [{ text: display }];
  const signature = ordered.map((s) => s.label).join("|");
  const groups =
    ordered.length === 1
      ? [word]
      : spelling.variants[word]?.[signature] ||
        spelling.groups[word]?.[String(ordered.length)];
  // Future unsupported words must not inherit an invented character boundary.
  if (!groups || groups.length !== ordered.length || groups.join("") !== word)
    return [{ text: display }];
  let offset = 0;
  const parts: SyllableLetters[] = groups.map((group, i) => {
    const text = display.slice(offset, offset + group.length);
    offset += group.length;
    return { text, syllable: ordered[i] };
  });
  if (offset < display.length) parts.push({ text: display.slice(offset) });
  return parts;
}
