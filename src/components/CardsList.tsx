import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Pager } from "../Pages";

type CardsListProps<T> = {
  items: readonly T[];
  render: (item: T, index: number) => ReactNode;
  label: string;
  empty?: ReactNode;
  index?: number;
  onIndex?: (index: number) => void;
  className?: string;
  gridClassName?: string;
  minCardWidth?: number;
  minCardHeight?: number;
  maxCardHeight?: number;
  maxColumns?: number;
  maxRows?: number;
};

// The measured panel owns both pagination capacity and the rendered grid.
// A short final page keeps the same card dimensions as the preceding page.
export function CardsList<T>({
  items,
  render,
  label,
  empty,
  index,
  onIndex,
  className = "",
  gridClassName = "",
  minCardWidth = 300,
  minCardHeight = 120,
  maxCardHeight = 176,
  maxColumns = 2,
  maxRows = 3,
}: CardsListProps<T>) {
  const panel = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [layout, setLayout] = useState({
    columns: 1,
    size: 1,
    height: minCardHeight,
  });
  const count = Math.ceil(items.length / layout.size);
  const current = Math.max(0, Math.min(index ?? page, Math.max(0, count - 1)));
  const latest = useRef({ current, size: layout.size, onIndex });
  useLayoutEffect(() => {
    latest.current = { current, size: layout.size, onIndex };
  });

  useLayoutEffect(() => {
    const node = panel.current;
    if (!node) return;
    let measured = false;
    const measure = () => {
      const gap = 12;
      const style = getComputedStyle(node);
      const width =
        node.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      const panelHeight =
        node.clientHeight -
        parseFloat(style.paddingTop) -
        parseFloat(style.paddingBottom);
      const columns = Math.max(
        1,
        Math.min(maxColumns, Math.floor((width + gap) / (minCardWidth + gap))),
      );
      const rowsAt = (height: number) =>
        Math.max(
          1,
          Math.min(maxRows, Math.floor((height + gap) / (minCardHeight + gap))),
        );
      // Reserve controls only if the complete list cannot fit without them.
      const needsPager = items.length > columns * rowsAt(panelHeight);
      const available = Math.max(
        minCardHeight,
        panelHeight - (needsPager ? 64 : 0),
      );
      const rows = rowsAt(available);
      const size = columns * rows;
      const height = Math.min(
        maxCardHeight,
        (available - gap * (rows - 1)) / rows,
      );
      const previous = latest.current;
      const next = Math.min(
        measured
          ? Math.floor((previous.current * previous.size) / size)
          : previous.current,
        Math.max(0, Math.ceil(items.length / size) - 1),
      );
      if (next !== previous.current) {
        setPage(next);
        previous.onIndex?.(next);
      }
      measured = true;
      latest.current = { ...previous, current: next, size };
      setLayout((old) =>
        old.columns === columns && old.size === size && old.height === height
          ? old
          : { columns, size, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [
    items.length,
    minCardWidth,
    minCardHeight,
    maxCardHeight,
    maxColumns,
    maxRows,
  ]);

  return (
    <div ref={panel} className={`cards-list ${className}`}>
      {items.length ? (
        <div
          className={`cards-list-grid ${gridClassName}`}
          style={
            {
              "--cards-columns": layout.columns,
              "--cards-height": `${layout.height}px`,
            } as CSSProperties
          }
        >
          {items
            .slice(current * layout.size, (current + 1) * layout.size)
            .map((item, i) => render(item, current * layout.size + i))}
        </div>
      ) : (
        empty
      )}
      {count > 1 && (
        <Pager
          index={current}
          count={count}
          onChange={onIndex ?? setPage}
          label={label}
        />
      )}
    </div>
  );
}
