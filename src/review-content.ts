import { guideFor, type Question } from "./content";
import type { ReadingBlock } from "./Pages";

export const exampleLabel = (q: Question) =>
  q.type === "write-essay"
    ? "Planning outline"
    : q.type === "answer-short-question"
      ? "Expected answer"
      : "Example response";

export function promptBlocks(q: Question): ReadingBlock[] {
  const blocks: ReadingBlock[] = [];
  const seen = new Set<string>();
  const add = (label: string, text?: string) => {
    if (!text || seen.has(text.trim())) return;
    seen.add(text.trim());
    blocks.push({ label, text });
  };
  add("Question", q.prompt);
  // Listening gaps use the complete transcript; repeating the same passage
  // with holes adds no new source information. Other gaps keep numbered anchors.
  if (guideFor(q).kind !== "blanks") {
    let gap = 0;
    add(
      q.type === "respond-to-situation"
        ? "Situation"
        : q.audioText
          ? "Displayed text"
          : "Passage",
      q.text?.replace(/\{\{\}\}/g, () => `[${++gap}]`),
    );
  }
  add("Transcript", q.audioText);
  return blocks;
}
