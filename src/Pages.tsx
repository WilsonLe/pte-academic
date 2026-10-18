import { useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "./components/ui/button";
import { readingBoundary } from "./reading-boundary";

export function Pager({
  index,
  count,
  onChange,
  label = "pages",
  counterLabel,
}: {
  index: number;
  count: number;
  onChange: (index: number) => void;
  label?: string;
  counterLabel?: string;
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
        {counterLabel && (
          <small className="page-counter-label">{counterLabel}</small>
        )}
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

/** Panel fit must react to font/accessibility overrides as well as geometry. */
export function observePageLayout(node: HTMLElement, pack: () => void) {
  const resize = new ResizeObserver(pack);
  resize.observe(node);
  const styles = new MutationObserver(pack);
  styles.observe(document.head, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  for (
    let parent: HTMLElement | null = node;
    parent;
    parent = parent.parentElement
  )
    styles.observe(parent, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });
  document.fonts.addEventListener("loadingdone", pack);
  void document.fonts.ready.then(pack);
  pack();
  return () => {
    resize.disconnect();
    styles.disconnect();
    document.fonts.removeEventListener("loadingdone", pack);
  };
}

export type ReadingBlock = { label?: string; text: string };
export type ReadingFocus = { block: number; offset: number };
type PageBlock = ReadingBlock & { block: number; start: number; end: number };

function ReadingBlocks({ blocks }: { blocks: ReadingBlock[] }) {
  return blocks.map((block, i) => (
    <div className="reading-block" key={i}>
      {block.label && <h3>{block.label}</h3>}
      <p>{block.text}</p>
    </div>
  ));
}

export function ReadingPages({
  texts = [],
  blocks,
  label = "reading pages",
  scroll = false,
  counterLabel,
  focus,
}: {
  texts?: string[];
  blocks?: ReadingBlock[];
  label?: string;
  scroll?: boolean;
  counterLabel?: string;
  focus?: ReadingFocus;
}) {
  const [index, setIndex] = useState(0);
  const [pages, setPages] = useState<PageBlock[][]>([[]]);
  const panel = useRef<HTMLDivElement>(null);
  // Plain reading consumers keep their existing deduplicated, packed prose.
  // Reviews can retain labels and line breaks without adding separate pagers.
  const source = JSON.stringify(
    blocks ?? [
      {
        text: [
          ...new Set(
            texts
              .map((text) => text.trim().replace(/\s+/g, " "))
              .filter(Boolean),
          ),
        ].join(" "),
      },
    ],
  );
  useLayoutEffect(() => {
    const node = panel.current;
    if (!node || scroll) return;
    let live = true;
    const paginate = () => {
      if (!live) return;
      const height = node.clientHeight;
      const width = node.getBoundingClientRect().width;
      if (width <= 0 || height <= 0) return;
      const measure = document.createElement("div");
      measure.className = "reading-copy";
      Object.assign(measure.style, {
        position: "fixed",
        visibility: "hidden",
        pointerEvents: "none",
        left: "0",
        top: "0",
        width: width + "px",
        height: "auto",
        minHeight: "0",
        boxSizing: "border-box",
      });
      // Inherit the actual panel's font, including zoom/user overrides.
      const style = getComputedStyle(node);
      measure.style.font = style.font;
      measure.style.lineHeight = style.lineHeight;
      measure.style.letterSpacing = style.letterSpacing;
      measure.style.padding = style.padding;
      measure.style.borderWidth = style.borderWidth;
      document.body.append(measure);
      const fits = (items: ReadingBlock[]) => {
        measure.replaceChildren();
        for (const item of items) {
          const block = document.createElement("div");
          block.className = "reading-block";
          if (item.label) {
            const title = document.createElement("h3");
            title.textContent = item.label;
            block.append(title);
          }
          const paragraph = document.createElement("p");
          paragraph.textContent = item.text;
          block.append(paragraph);
          measure.append(block);
        }
        return measure.clientHeight <= height;
      };
      const next: PageBlock[][] = [];
      let page: PageBlock[] = [];
      for (const [blockIndex, block] of (
        JSON.parse(source) as ReadingBlock[]
      ).entries()) {
        if (!block.text.trim()) continue;
        if (fits([...page, block])) {
          page.push({
            ...block,
            block: blockIndex,
            start: 0,
            end: block.text.length,
          });
          continue;
        }
        // Keep a block together if it can fit on a fresh page.
        if (page.length) {
          next.push(page);
          page = [];
        }
        let rest = block.text.trim();
        let start = block.text.indexOf(rest);
        let continued = false;
        while (rest) {
          let title = block.label
            ? block.label + (continued ? " (continued)" : "")
            : undefined;
          // A continuation heading must leave room for prose, including at
          // enlarged fonts. Retain its source identity without forcing letters
          // onto separate pages merely to accommodate the extra suffix.
          if (
            continued &&
            block.label &&
            !fits([{ label: title, text: rest.split(/\s+/)[0] }])
          )
            title = block.label;
          if (fits([{ label: title, text: rest }])) {
            page.push({
              label: title,
              text: rest,
              block: blockIndex,
              start,
              end: start + rest.length,
            });
            break;
          }
          // Measure the maximum fit first, then preserve complete paragraphs
          // or sentences wherever possible. Oversized units still split safely.
          let low = 1,
            high = rest.length,
            fit = 1;
          while (low <= high) {
            const n = Math.floor((low + high) / 2);
            if (fits([{ label: title, text: rest.slice(0, n) }])) {
              fit = n;
              low = n + 1;
            } else high = n - 1;
          }
          fit = readingBoundary(rest, fit);
          const text = rest.slice(0, fit).trimEnd();
          next.push([
            {
              label: title,
              text,
              block: blockIndex,
              start,
              end: start + text.length,
            },
          ]);
          const tail = rest.slice(fit);
          rest = tail.trimStart();
          start += fit + tail.length - rest.length;
          continued = true;
        }
      }
      if (page.length) next.push(page);
      measure.remove();
      if (!next.length) next.push([]);
      setPages((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next,
      );
    };
    const disconnect = observePageLayout(node, paginate);
    return () => {
      live = false;
      disconnect();
    };
  }, [source, scroll]);
  useLayoutEffect(() => {
    if (!focus || scroll) return;
    const target = pages.findIndex((page) =>
      page.some(
        (part) =>
          part.block === focus.block &&
          focus.offset >= part.start &&
          focus.offset < part.end,
      ),
    );
    if (target >= 0) setIndex(target);
  }, [pages, focus, scroll]);
  const current = Math.min(index, pages.length - 1);
  return (
    <div className={`reading-pages ${scroll ? "reading-pages-scroll" : ""}`}>
      <div
        className="reading-copy"
        ref={panel}
        role={scroll ? "region" : undefined}
        aria-label={scroll ? label : undefined}
        tabIndex={scroll ? 0 : undefined}
      >
        <div key={current} className="page-enter">
          <ReadingBlocks
            blocks={scroll ? JSON.parse(source) : pages[current]}
          />
        </div>
      </div>
      {!scroll && (
        <Pager
          index={current}
          count={pages.length}
          onChange={setIndex}
          label={label}
          counterLabel={counterLabel}
        />
      )}
    </div>
  );
}
