import { useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "./components/ui/button";

export function Pager({
  index,
  count,
  onChange,
  label = "pages",
}: {
  index: number;
  count: number;
  onChange: (index: number) => void;
  label?: string;
}) {
  if (count <= 1) return null;
  return (
    <nav className="page-controls" aria-label={label}>
      <Button
        variant="outline"
        size="icon"
        aria-label={`Previous ${label}`}
        disabled={index <= 0}
        onClick={() => onChange(index - 1)}
      >
        <ArrowLeft />
      </Button>
      <span role="status" aria-live="polite">
        {index + 1} <span>/ {Math.max(1, count)}</span>
      </span>
      <Button
        variant="outline"
        size="icon"
        aria-label={`Next ${label}`}
        disabled={index >= count - 1}
        onClick={() => onChange(index + 1)}
      >
        <ArrowRight />
      </Button>
    </nav>
  );
}

export function ReadingPages({
  texts,
  label = "reading pages",
}: {
  texts: string[];
  label?: string;
}) {
  const [index, setIndex] = useState(0);
  const [pages, setPages] = useState<string[]>([""]);
  const panel = useRef<HTMLDivElement>(null);
  const source = JSON.stringify(texts);
  useLayoutEffect(() => {
    const node = panel.current;
    if (!node) return;
    let live = true;
    const paginate = () => {
      if (!live) return;
      const style = getComputedStyle(node);
      const height =
        node.clientHeight -
        parseFloat(style.paddingTop) -
        parseFloat(style.paddingBottom);
      const width =
        node.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      if (width <= 0 || height <= 0) return;
      // Measure the actual font and available panel. This also handles long
      // words, small screens and enlarged text without hiding the last line.
      const measure = document.createElement("div");
      Object.assign(measure.style, {
        position: "fixed",
        visibility: "hidden",
        pointerEvents: "none",
        left: "0",
        top: "0",
        width: width + "px",
        font: style.font,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        overflowWrap: "anywhere",
      });
      document.body.append(measure);
      const next: string[] = [];
      for (const text of JSON.parse(source) as string[]) {
        const words = text.trim().split(/\s+/);
        for (let start = 0; start < words.length;) {
          let low = 1,
            high = words.length - start,
            fit = 1;
          while (low <= high) {
            const n = Math.floor((low + high) / 2);
            measure.textContent = words.slice(start, start + n).join(" ");
            if (measure.getBoundingClientRect().height <= height) {
              fit = n;
              low = n + 1;
            } else high = n - 1;
          }
          measure.textContent = words[start];
          if (
            fit === 1 &&
            words[start].length > 1 &&
            measure.getBoundingClientRect().height > height
          ) {
            let first = 1,
              last = words[start].length,
              chars = 1;
            while (first <= last) {
              const mid = Math.floor((first + last) / 2);
              measure.textContent = words[start].slice(0, mid);
              if (measure.getBoundingClientRect().height <= height) {
                chars = mid;
                first = mid + 1;
              } else last = mid - 1;
            }
            next.push(words[start].slice(0, chars));
            words[start] = words[start].slice(chars);
          } else {
            next.push(words.slice(start, start + fit).join(" "));
            start += fit;
          }
        }
      }
      measure.remove();
      if (!next.length)
        next.push("No additional text. See the question image.");
      setPages((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      );
    };
    paginate();
    const observer = new ResizeObserver(paginate);
    observer.observe(node);
    void document.fonts.ready.then(paginate);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [source]);
  const current = Math.min(index, pages.length - 1);
  return (
    <div className="reading-pages">
      <div className="reading-copy" ref={panel}>
        <p key={current} className="page-enter">
          {pages[current]}
        </p>
      </div>
      <Pager
        index={current}
        count={pages.length}
        onChange={setIndex}
        label={label}
      />
    </div>
  );
}
