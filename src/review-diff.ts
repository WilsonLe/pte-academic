import {
  feedback,
  guideFor,
  normalize,
  type Answer,
  type Question,
} from "./content";
import { exampleLabel } from "./review-content";
import { readingBoundary } from "./reading-boundary";
import type { ReadingBlock } from "./Pages";

export type DiffPart = {
  text: string;
  tone: "good" | "bad" | "neutral";
  mark: string;
};
export type ReviewItem = {
  id: string;
  title: string;
  state: string;
  parts: DiffPart[];
  detail: ReadingBlock[];
  words?: boolean;
};
const good = (text: string, mark = "+"): DiffPart => ({
  text,
  tone: "good",
  mark,
});
const bad = (text: string): DiffPart => ({ text, tone: "bad", mark: "−" });
const neutral = (text: string): DiffPart => ({
  text,
  tone: "neutral",
  mark: "",
});
const option = (q: Question, value?: string) =>
  value === undefined
    ? "Not placed"
    : q.options?.[Number(value)] || "Unavailable option";

/** Display-only alignment for dictation; never used for speech or scoring. */
export function dictationDiff(actual: string, expected: string): DiffPart[][] {
  const tokens = (text: string) => {
    const result: string[] = [],
      prefix: string[] = [];
    for (const word of text.trim().split(/\s+/).filter(Boolean)) {
      if (!normalize(word) && result.length)
        result[result.length - 1] += ` ${word}`;
      else if (!normalize(word)) prefix.push(word);
      else {
        result.push([...prefix, word].join(" "));
        prefix.length = 0;
      }
    }
    if (prefix.length) result.push(prefix.join(" "));
    return result;
  };
  const a = tokens(actual),
    b = tokens(expected);
  const rows = Array.from(
    { length: a.length + 1 },
    () => new Uint32Array(b.length + 1),
  );
  for (let i = 0; i <= a.length; i++) rows[i][0] = i;
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] +
          Number(normalize(a[i - 1]) !== normalize(b[j - 1])),
      );
  const output: DiffPart[][] = [];
  let i = a.length,
    j = b.length;
  while (i || j) {
    if (
      i &&
      j &&
      rows[i][j] ===
        rows[i - 1][j - 1] + Number(normalize(a[i - 1]) !== normalize(b[j - 1]))
    ) {
      output.push(
        normalize(a[i - 1]) === normalize(b[j - 1])
          ? [good(a[i - 1], "✓")]
          : [bad(a[i - 1]), good(b[j - 1])],
      );
      i--;
      j--;
    } else if (i && rows[i][j] === rows[i - 1][j] + 1) {
      output.push([bad(a[--i])]);
    } else {
      output.push([good(b[--j])]);
    }
  }
  return output.reverse();
}

export function reviewItems(q: Question, a: Answer): ReviewItem[] {
  const kind = guideFor(q).kind;
  const values = a.values || [];
  const summary = feedback(q, a).detail;
  const rationale: ReadingBlock[] = [
    { text: q.explanation },
    ...(summary && !["write", "speak", "order", "dictation"].includes(kind)
      ? [{ text: summary }]
      : []),
  ];
  const make = (
    id: string,
    title: string,
    state: string,
    parts: DiffPart[],
    detail = rationale,
  ): ReviewItem => ({ id, title, state, parts, detail });
  if (kind === "order")
    return q.answers!.map((value, i) => {
      const matches = values[i] === value;
      return make(
        String(i),
        `Paragraph ${i + 1}`,
        matches
          ? "In place"
          : values[i] === undefined
            ? "Not placed"
            : "Different position",
        matches
          ? [good(option(q, value), "✓")]
          : [bad(option(q, values[i])), good(option(q, value))],
        [{ text: q.orderExplanations![i] }],
      );
    });
  if (kind === "single" || kind === "multi")
    return q.options!.map((text, i) => {
      const selected = values.includes(String(i)),
        correct = q.answers!.includes(String(i));
      const state = selected
        ? correct
          ? "Selected · Correct"
          : "Selected · Incorrect"
        : correct
          ? "Missed"
          : "Not selected";
      return make(
        String(i),
        `Option ${String.fromCharCode(65 + i)}`,
        state,
        [
          correct
            ? good(text, selected ? "✓" : "+")
            : selected
              ? bad(text)
              : neutral(text),
        ],
        [...rationale, { text: state }],
      );
    });
  if (["dropdown", "bank", "blanks"].includes(kind))
    return q.answers!.map((expected, i) => {
      const actual = values[i]?.trim() || "",
        matches = normalize(actual) === normalize(expected);
      return make(
        String(i),
        `Gap ${i + 1}`,
        matches ? "Correct" : actual ? "Incorrect" : "Unanswered",
        matches
          ? [good(actual, "✓")]
          : [bad(actual || "Not answered"), good(expected)],
        [...rationale, { text: `Gap ${i + 1}: ${expected}` }],
      );
    });
  if (kind === "highlight") {
    const written = q.text!.trim().split(/\s+/),
      heard = q.audioText!.trim().split(/\s+/);
    return [...new Set([...values, ...q.answers!])]
      .sort((x, y) => Number(x) - Number(y))
      .map((value) => {
        const i = Number(value),
          selected = values.includes(value),
          changed = q.answers!.includes(value);
        const state = changed
          ? selected
            ? "Selected · Correct"
            : "Missed"
          : "Selected · Incorrect";
        return make(
          value,
          `Word ${i + 1}`,
          state,
          changed ? [bad(written[i]), good(heard[i])] : [neutral(written[i])],
          [
            {
              text: changed
                ? selected
                  ? `You correctly selected “${written[i]}”: the displayed word differs from “${heard[i]}” in the recording.`
                  : `The displayed word “${written[i]}” differs from “${heard[i]}” in the recording and should be selected.`
                : `“${written[i]}” matches the recording and should remain unselected. Only select words that differ from what you hear.`,
            },
          ],
        );
      });
  }
  if (kind === "dictation") {
    const diff = dictationDiff(a.text || "", q.model || "");
    const items: ReviewItem[] = [];
    for (let i = 0; i < diff.length; i += 6)
      items.push({
        ...make(
          String(i),
          `Words ${i + 1}–${Math.min(i + 6, diff.length)}`,
          "Sentence comparison",
          diff.slice(i, i + 6).flat(),
          [{ text: feedback(q, a).detail }, ...rationale],
        ),
        words: true,
      });
    return items;
  }
  // Writing is one response. Let the rendered panel measure its reading pages;
  // fixed character chunks would discard the essay's paragraph structure.
  if (kind === "write")
    return [
      make(
        "response",
        "Response",
        "Not automatically graded",
        [neutral(a.text?.trim() || "No saved text response.")],
        [
          ...rationale,
          { text: feedback(q, a).detail },
          ...(q.model ? [{ label: exampleLabel(q), text: q.model }] : []),
        ],
      ),
    ];
  // Legacy transcripts have alternatives, not exact answer keys.
  let rest =
    (kind === "speak" ? a.transcription?.text : a.text)?.trim() ||
    "No saved text response.";
  const items: ReviewItem[] = [];
  while (rest) {
    const end = readingBoundary(rest, Math.min(rest.length, 180));
    const text = rest.slice(0, end).trimEnd();
    items.push(
      make(
        String(items.length),
        `Response ${items.length + 1}`,
        "Not automatically graded",
        [neutral(text)],
        [
          ...rationale,
          ...(q.model ? [{ label: exampleLabel(q), text: q.model }] : []),
        ],
      ),
    );
    rest = rest.slice(end).trimStart();
  }
  return items;
}
