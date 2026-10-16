import {
  answerMatches,
  feedback,
  guideFor,
  normalize,
  type Answer,
  type Question,
} from "./content";
import type { ReadingBlock } from "./Pages";

const option = (q: Question, value: string) =>
  q.options?.[Number(value)] || "Unavailable option";
const letter = (i: number) => String.fromCharCode(65 + i);
export const exampleLabel = (q: Question) =>
  q.type === "write-essay"
    ? "Planning outline"
    : q.type === "answer-short-question"
      ? "Expected answer"
      : "Example response";

export function responseBlocks(q: Question, a: Answer): ReadingBlock[] {
  const kind = guideFor(q).kind;
  const values = a.values || [];
  if (kind === "speak")
    return [{ text: "No recording was saved for this response." }];
  if (kind === "write" || kind === "dictation") {
    const matches = answerMatches(q, a);
    return [
      { label: "Your response", text: a.text?.trim() || "No response" },
      ...(q.model && !matches
        ? [
            {
              label:
                kind === "dictation" ? "Recorded sentence" : exampleLabel(q),
              text: q.model,
            },
          ]
        : []),
    ];
  }
  if (kind === "single" || kind === "multi") {
    return [
      ...(!values.length ? [{ text: "No response" }] : []),
      ...(q.options || []).map((text, i) => {
        const selected = values.includes(String(i));
        const correct = q.answers!.includes(String(i));
        const state = selected
          ? correct
            ? "Selected · Correct"
            : "Selected · Incorrect"
          : correct
            ? "Correct answer · Not selected"
            : "Not selected";
        return { label: `${letter(i)} · ${state}`, text };
      }),
    ];
  }
  if (kind === "order") {
    const matches = answerMatches(q, a);
    const sequence = (items: string[]) =>
      items.map((value, i) => `${i + 1}. ${option(q, value)}`).join("\n");
    return [
      { label: "Your order", text: sequence(values) || "No response" },
      ...(!matches
        ? [{ label: "Correct order", text: sequence(q.answers!) }]
        : []),
    ];
  }
  if (kind === "highlight") {
    const written = q.text!.trim().split(/\s+/);
    const spoken = q.audioText!.trim().split(/\s+/);
    const positions = [...new Set([...values, ...q.answers!])].sort(
      (a, b) => Number(a) - Number(b),
    );
    return [
      ...(!values.length ? [{ text: "No words selected" }] : []),
      ...positions.map((value) => {
        const i = Number(value),
          selected = values.includes(value),
          correct = q.answers!.includes(value);
        const state = selected
          ? correct
            ? "Selected · Correct"
            : "Selected · Incorrect"
          : "Missed";
        return {
          label: `Word ${i + 1} · ${state}`,
          text: `Written: ${written[i]}\nHeard: ${spoken[i]}`,
        };
      }),
    ];
  }
  return q.answers!.map((expected, i) => {
    const actual = values[i]?.trim() || "";
    const matches = normalize(actual) === normalize(expected);
    return {
      label: `Gap ${i + 1} · ${matches ? "Correct" : actual ? "Incorrect" : "Unanswered"}`,
      text: `Your response: ${actual || "No response"}${matches ? "" : `\nAnswer key: ${expected}`}`,
    };
  });
}

export function feedbackBlocks(q: Question, a: Answer): ReadingBlock[] {
  const detail = feedback(q, a).detail;
  return [
    ...(detail ? [{ text: detail }] : []),
    {
      label: guideFor(q).kind === "write" ? "What to check" : "Why",
      text: q.explanation,
    },
  ];
}

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
