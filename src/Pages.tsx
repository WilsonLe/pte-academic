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
}: {
  texts?: string[];
  blocks?: ReadingBlock[];
  label?: string;
  scroll?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [pages, setPages] = useState<ReadingBlock[][]>([[]]);
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
      const next: ReadingBlock[][] = [];
      let page: ReadingBlock[] = [];
      for (const block of JSON.parse(source) as ReadingBlock[]) {
        if (!block.text.trim()) continue;
        if (fits([...page, block])) {
          page.push(block);
          continue;
        }
        // Keep a block together if it can fit on a fresh page.
        if (page.length) {
          next.push(page);
          page = [];
        }
        let rest = block.text.trim();
        let continued = false;
        while (rest) {
          const title = block.label
            ? block.label + (continued ? " (continued)" : "")
            : undefined;
          if (fits([{ label: title, text: rest }])) {
            page.push({ label: title, text: rest });
            break;
          }
          // Preserve all text, preferring whitespace boundaries. At extreme
          // zoom even one word may need splitting; never clip a trailing line.
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
          const boundary = rest.slice(0, fit + 1).search(/\s+\S*$/);
          if (boundary > 0) fit = boundary;
          next.push([{ label: title, text: rest.slice(0, fit).trimEnd() }]);
          rest = rest.slice(fit).trimStart();
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
        />
      )}
    </div>
  );
}
