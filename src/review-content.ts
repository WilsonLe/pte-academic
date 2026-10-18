import { guideFor, type Question } from "./content";
import type { ReadingBlock } from "./Pages";

export const exampleLabel = (q: Question) =>
  q.type === "write-essay"
    ? "Planning outline"
    : q.type === "answer-short-question"
      ? "Expected answer"
      : "Example response";

/** What the learner was asked, never an answer key, example or rationale. */
export function questionBlocks(q: Question): ReadingBlock[] {
  const blocks: ReadingBlock[] = [];
  if (q.text) {
    let gap = 0;
    blocks.push({ text: q.text.replace(/\{\{\}\}/g, () => `[${++gap}]`) });
  } else if (q.audioText)
    blocks.push({ label: "Transcript", text: q.audioText });
  const kind = guideFor(q).kind;
  if (kind === "order")
    q.options?.forEach((text, i) =>
      blocks.push({ label: `Paragraph ${i + 1}`, text }),
    );
  if (kind === "bank" && q.options)
    blocks.push({ label: "Word bank", text: q.options.join(" · ") });
  q.blankOptions?.forEach((options, i) =>
    blocks.push({ label: `Gap ${i + 1} choices`, text: options.join(" · ") }),
  );
  return blocks;
}
