import { useId, useLayoutEffect, useRef, useState } from "react";
import { Pager, observePageLayout } from "../Pages";
import type { RecognizedWord } from "./recognition-core";
import type { Pronunciation } from "./comparison-schema";
import { scriptKey } from "./comparison-core";
import {
  syllableLetters,
  syllableDescription,
  similarityTone,
} from "./syllable-display";
export type Syllable = Pronunciation["syllables"][number];
export type FeedbackWord = {
  word: string;
  index: number;
  syllables: Syllable[];
  spoken?: RecognizedWord;
  expected?: string;
  omitted?: boolean;
};
export function feedbackWords(
  text: string,
  result?: Pronunciation,
): FeedbackWord[] {
  if (result?.recognition) return recognizedFeedbackWords(text, result);
  const display = text.match(/[a-z]+(?:['’‘][a-z]+)?[^a-z]*/gi) || [];
  return scriptKey(text)
    .split(" ")
    .filter(Boolean)
    .map((word, index) => ({
      word: display[index]?.trim() || word,
      index,
      syllables: result?.syllables.filter((s) => s.wordIndex === index) || [],
    }));
}
// Explicit orthographic equivalents only. Never merge homophones or fuzzy
// spellings, and never pass this display key to recognition or acoustic grading.
function spokenSpellingKey(word: string) {
  if (word === "judgement") return "judgment";
  if (word === "judgements") return "judgments";
  return word;
}
const sameSpokenSpelling = (left: string, right: string) =>
  spokenSpellingKey(left) === spokenSpellingKey(right);

/** Edit-distance diff is display-only; it cannot feed back into recognition/scoring. */
export function recognizedFeedbackWords(
  text: string,
  result: Pronunciation,
): FeedbackWord[] {
  const spoken = result.recognition!.words;
  const source = scriptKey(text).split(" ").filter(Boolean);
  const displays = text.match(/[a-z]+(?:['’‘][a-z]+)?[^a-z]*/gi) || [];
  const asWord = (i: number, expected?: string): FeedbackWord => ({
    word:
      expected && source[Number(expected)] === spoken[i].word
        ? displays[Number(expected)]?.trim() || spoken[i].word
        : spoken[i].word,
    index: i,
    spoken: spoken[i],
    expected:
      expected !== undefined &&
      !sameSpokenSpelling(source[Number(expected)], spoken[i].word)
        ? displays[Number(expected)]?.trim() || source[Number(expected)]
        : undefined,
    syllables: result.syllables.filter((s) => s.wordIndex === i),
  });
  if (!source.length) return spoken.map((_, i) => asWord(i));
  const rows = Array.from(
    { length: source.length + 1 },
    () => new Uint16Array(spoken.length + 1),
  );
  for (let i = 0; i <= source.length; i++) rows[i][0] = i;
  for (let j = 0; j <= spoken.length; j++) rows[0][j] = j;
  for (let i = 1; i <= source.length; i++)
    for (let j = 1; j <= spoken.length; j++)
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] +
          (sameSpokenSpelling(source[i - 1], spoken[j - 1].word) ? 0 : 1),
      );
  const output: FeedbackWord[] = [];
  let i = source.length,
    j = spoken.length;
  while (i || j) {
    if (
      i &&
      j &&
      rows[i][j] ===
        rows[i - 1][j - 1] +
          (sameSpokenSpelling(source[i - 1], spoken[j - 1].word) ? 0 : 1)
    ) {
      output.push(asWord(j - 1, String(i - 1)));
      i--;
      j--;
    } else if (j && rows[i][j] === rows[i][j - 1] + 1) {
      output.push(asWord(j - 1));
      j--;
    } else {
      output.push({
        word: displays[i - 1]?.trim() || source[i - 1],
        index: -i,
        syllables: [],
        omitted: true,
      });
      i--;
    }
  }
  return output.reverse();
}
export function SpeechDiff({
  words,
  onSelect,
}: {
  words: FeedbackWord[];
  onSelect: (word: FeedbackWord) => void;
}) {
  const descriptionId = useId();
  const panel = useRef<HTMLDivElement>(null),
    measure = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<FeedbackWord[][]>([words]);
  const [page, setPage] = useState(0);
  const anchor = useRef<FeedbackWord | undefined>(undefined);
  useLayoutEffect(() => {
    let live = true;
    // Lead with the learner's recognised evidence, keeping the full prompt diff
    // in its original order and earlier omissions reachable through the pager.
    anchor.current = words.find((word) => word.spoken) || words[0];
    const pack = () => {
      if (!live || !panel.current || !measure.current) return;
      const nodes = Array.from(measure.current.children) as HTMLElement[];
      const full = measure.current.getBoundingClientRect().height;
      const height =
        panel.current.clientHeight -
        (full > panel.current.clientHeight ? 56 : 0);
      const next: FeedbackWord[][] = [];
      let current: FeedbackWord[] = [],
        top = nodes[0]?.offsetTop || 0;
      nodes.forEach((node, i) => {
        if (
          current.length &&
          node.offsetTop + node.offsetHeight - top > height
        ) {
          next.push(current);
          current = [];
          top = node.offsetTop;
        }
        current.push(words[i]);
      });
      if (current.length) next.push(current);
      setPages(next.length ? next : [[]]);
      setPage(
        Math.max(
          0,
          next.findIndex((words) => words.includes(anchor.current!)),
        ),
      );
    };
    const disconnect = panel.current
      ? observePageLayout(panel.current, pack)
      : () => {};
    return () => {
      live = false;
      disconnect();
    };
  }, [words]);
  const wordButton = (word: FeedbackWord, measuring = false) => (
    <button
      key={word.index}
      className={`feedback-word${word.omitted ? " omitted-word" : ""}`}
      type="button"
      aria-label={
        measuring
          ? undefined
          : word.omitted
            ? `Not heard: ${word.word}. Explain`
            : `Practise word ${word.index + 1}: ${word.word}`
      }
      aria-describedby={
        measuring ? undefined : `${descriptionId}-${word.index}`
      }
      tabIndex={measuring ? -1 : undefined}
      onClick={() => onSelect(word)}
    >
      <span className="word-characters" aria-hidden="true">
        {syllableLetters(word.word, word.syllables).map((part, index) => (
          <span
            key={index}
            className={part.syllable ? "syllable-letters" : undefined}
            data-tone={
              part.syllable
                ? similarityTone(part.syllable.similarity)
                : undefined
            }
            title={
              part.syllable ? syllableDescription(part.syllable) : undefined
            }
          >
            {part.text}
          </span>
        ))}
      </span>
      {word.expected && (
        <span className="word-replacement">instead of {word.expected}</span>
      )}
      {word.omitted && <span className="word-replacement">Not heard</span>}
      {!measuring && (
        <span id={`${descriptionId}-${word.index}`} className="sr-only">
          {word.syllables.length
            ? word.syllables.map(syllableDescription).join(". ")
            : "Unscored"}
        </span>
      )}
    </button>
  );
  return (
    <div
      ref={panel}
      className="speech-diff"
      aria-label="Prompt and spoken syllable comparison"
    >
      <div className="diff-measure-box" aria-hidden="true">
        <div ref={measure} className="feedback-words">
          {words.map((w) => wordButton(w, true))}
        </div>
      </div>
      <div className="feedback-words diff-page">
        {(pages[page] || []).map((w) => wordButton(w))}
      </div>
      <Pager
        index={page}
        count={pages.length}
        onChange={(index) => {
          anchor.current = pages[index]?.[0];
          setPage(index);
        }}
        label="prompt word pages"
      />
    </div>
  );
}
