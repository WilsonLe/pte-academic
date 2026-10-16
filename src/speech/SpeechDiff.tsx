import { useId, useLayoutEffect, useRef, useState } from "react";
import { Pager, observePageLayout } from "../Pages";
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
};
export function feedbackWords(
  text: string,
  result?: Pronunciation,
): FeedbackWord[] {
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
  useLayoutEffect(() => {
    let live = true;
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
      setPage((p) => Math.min(p, Math.max(0, next.length - 1)));
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
      className="feedback-word"
      type="button"
      aria-label={
        measuring ? undefined : `Practise word ${word.index + 1}: ${word.word}`
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
        onChange={setPage}
        label="prompt word pages"
      />
    </div>
  );
}
