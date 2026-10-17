const sentences =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("en", { granularity: "sentence" })
    : undefined;

/** Prefer complete lines/paragraphs, then sentences, before splitting a unit. */
export function readingBoundary(text: string, limit: number): number {
  let offset = 0;
  let boundary = 0;
  for (const line of text.split("\n")) {
    const end = offset + line.trimEnd().length;
    if (end > limit) break;
    if (end > 0) boundary = end;
    offset += line.length + 1;
  }
  if (boundary) return boundary;

  // A numbered paragraph may itself exceed a page. Only then split its prose.
  const firstLine = text.split("\n", 1)[0];
  for (const part of sentences?.segment(firstLine) ?? []) {
    const end = part.index + part.segment.trimEnd().length;
    if (end > limit) break;
    // A paragraph number or discussion speaker cue belongs to the next words.
    if (!/^(?:\d+|Speaker (?:one|two|three))\.$/.test(part.segment.trim()))
      boundary = end;
  }
  if (boundary) return boundary;

  // An oversized sentence still has to fit; retain the existing lossless escape.
  const space = text.slice(0, limit + 1).search(/\s+\S*$/);
  return space > 0 ? space : Math.max(1, limit);
}
