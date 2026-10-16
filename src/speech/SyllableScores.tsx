import { useLayoutEffect, useRef, useState } from "react";
import { Pager } from "../Pages";
import type { Pronunciation } from "./comparison-schema";
type Syllable = Pronunciation["syllables"][number];
export function SyllableScores({ syllables }: { syllables: Syllable[] }) {
  const panel = useRef<HTMLDivElement>(null),
    measure = useRef<HTMLTableElement>(null);
  const [pages, setPages] = useState<Syllable[][]>([syllables]),
    [index, setIndex] = useState(0);
  useLayoutEffect(() => {
    let alive = true;
    const paginate = () => {
      if (!alive || !panel.current || !measure.current) return;
      const height = panel.current.clientHeight,
        header = measure.current.tHead!.getBoundingClientRect().height;
      const rows = Array.from(measure.current.tBodies[0].rows).map(
        (r) => r.getBoundingClientRect().height,
      );
      if (!height || !rows.length) return;
      const total = rows.reduce((a, b) => a + b, 0);
      const available = height - header - (total + header > height ? 56 : 0);
      const next: Syllable[][] = [];
      let page: Syllable[] = [],
        used = 0;
      for (let i = 0; i < syllables.length; i++) {
        if (page.length && used + rows[i] > available) {
          next.push(page);
          page = [];
          used = 0;
        }
        page.push(syllables[i]);
        used += rows[i];
      }
      if (page.length) next.push(page);
      setPages((current) =>
        current.length === next.length &&
        current.every(
          (p, i) =>
            p.length === next[i].length && p.every((s, j) => s === next[i][j]),
        )
          ? current
          : next,
      );
      setIndex((i) => Math.min(i, Math.max(0, next.length - 1)));
    };
    const observer = new ResizeObserver(paginate);
    if (panel.current) observer.observe(panel.current);
    if (measure.current) observer.observe(measure.current);
    document.fonts.ready.then(paginate);
    paginate();
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [syllables]);
  const table = (items: Syllable[], measurement = false) => (
    <table
      ref={measurement ? measure : undefined}
      className={`syllable-table${measurement ? " syllable-measure" : ""}`}
      aria-hidden={measurement || undefined}
      aria-label={measurement ? undefined : "Syllable similarities"}
    >
      <colgroup>
        <col style={{ width: "46%" }} />
        <col style={{ width: "25%" }} />
        <col style={{ width: "29%" }} />
      </colgroup>
      <thead>
        <tr>
          <th>Syllable</th>
          <th>Similarity</th>
          <th>Time</th>
        </tr>
      </thead>
      <tbody>
        {items.map((s) => (
          <tr
            key={`${s.wordIndex}-${s.syllableIndex}`}
            title={`${s.label} · ${s.status}`}
          >
            <td>
              {s.word}{" "}
              <span className="text-muted-foreground">
                · {s.syllableIndex + 1}
              </span>
            </td>
            <td>
              {s.similarity === null ? (
                <span aria-label="Uncertain syllable">Uncertain</span>
              ) : (
                s.similarity.toFixed(1)
              )}
            </td>
            <td className="text-muted-foreground">
              {s.start.toFixed(2)}–{s.end.toFixed(2)}s
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <div ref={panel} className="syllable-results">
      <div className="syllable-measure-box" aria-hidden="true">
        {table(syllables, true)}
      </div>
      <div className="syllable-table-view">{table(pages[index] || [])}</div>
      <Pager
        index={index}
        count={pages.length}
        onChange={setIndex}
        label="syllable score pages"
      />
    </div>
  );
}
