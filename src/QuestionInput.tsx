import { Textarea } from "./components/ui/textarea";
import { useId, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowLeft, ArrowRight } from "lucide-react";
import { type Answer, type Question, guideFor, wordCount } from "./content";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./components/ui/tooltip";
export function Chart({
  q,
  responsive = false,
}: {
  q: Question;
  responsive?: boolean;
}) {
  const c = q.chart!;
  const max = Math.max(...c.values) * 1.15;
  return (
    <figure
      className="chart"
      aria-label={`${c.title}: ${c.labels.map((x, i) => `${x} ${c.values[i]} ${c.unit}`).join(", ")}`}
    >
      <figcaption>{c.title}</figcaption>
      <div className="chart-unit">{c.unit}</div>
      <div className="chart-bars">
        {c.labels.map((x, i) => (
          <div className="chart-column" key={x}>
            <span>{c.values[i]}</span>
            <div
              className="bar"
              style={{
                height: responsive
                  ? `${(c.values[i] / max) * 100}%`
                  : `${(c.values[i] / max) * 200}px`,
              }}
            />
            <span>{x}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
export function QuestionInput({
  q,
  answer,
  onChange,
  disabled,
}: {
  q: Question;
  answer: Answer;
  onChange: (a: Answer) => void;
  disabled: boolean;
}) {
  const g = guideFor(q);
  const gapHintId = useId();
  const values = answer.values || [];
  const [word, setWord] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [clip, setClip] = useState("");
  const [editMessage, setEditMessage] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const setValues = (next: string[]) => onChange({ ...answer, values: next });
  const toggle = (v: string) =>
    setValues(
      values.includes(v) ? values.filter((x) => x !== v) : [...values, v],
    );
  const setBlank = (i: number, v: string) => {
    const next = [...values];
    while (next.length < (q.answers?.length || 0)) next.push("");
    next[i] = v;
    setValues(next);
  };
  function place(i: number, value: string) {
    if (!value) return;
    const next = [...values];
    while (next.length < q.answers!.length) next.push("");
    const existing = next.indexOf(value);
    if (existing >= 0) next[existing] = "";
    next[i] = value;
    setValues(next);
    setWord("");
  }
  const gapAction = (i: number) =>
    word
      ? `Place ${word} in blank ${i + 1}`
      : values[i]
        ? `Clear blank ${i + 1}`
        : "Select a word first";
  const insert = (id: string) => {
    setValues([...values, id]);
    setSelected(null);
  };
  const move = (at: number, delta: number) => {
    const next = [...values];
    [next[at], next[at + delta]] = [next[at + delta], next[at]];
    setValues(next);
  };
  function edit(action: "Cut" | "Copy" | "Paste") {
    const el = textarea.current;
    if (!el) return;
    const text = answer.text || "";
    const a = el.selectionStart,
      b = el.selectionEnd;
    el.focus();
    el.setSelectionRange(a, b);
    if (action === "Paste" && !clip) {
      setEditMessage("Select text and use Copy or Cut first.");
      return;
    }
    if (action !== "Paste" && a === b) {
      setEditMessage("Select text in your answer first.");
      return;
    }
    if (action !== "Copy") {
      // Native editing retains Undo/Redo; assigning a controlled value does not.
      // Keep this transaction local: no system clipboard or HTML insertion.
      try {
        if (
          !document.execCommand(
            "insertText",
            false,
            action === "Paste" ? clip : "",
          )
        )
          throw new Error("Native edit unavailable");
      } catch {
        setEditMessage(
          "This browser could not edit the selection. Use keyboard shortcuts.",
        );
        return;
      }
      // Some browsers do not dispatch input for execCommand; publish synchronously
      // so an immediate finish/deadline also captures the actual textarea value.
      onChange({ ...answer, text: el.value });
    }
    if (action !== "Paste") setClip(text.slice(a, b));
    setEditMessage(
      action === "Paste"
        ? "Pasted from answer clipboard."
        : `${action === "Cut" ? "Cut" : "Copied"} selected text to answer clipboard.`,
    );
  }
  if (g.kind === "speak") return <>{q.chart && <Chart q={q} />}</>;
  if (g.kind === "write" || g.kind === "dictation")
    return (
      <div className="writing">
        <label className="sr-only" htmlFor="response">
          Your response
        </label>
        <Textarea
          id="response"
          ref={textarea}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          value={answer.text || ""}
          onChange={(e) => onChange({ ...answer, text: e.target.value })}
          rows={g.kind === "dictation" ? 4 : 10}
        />
        <div className="writing-tools">
          <div>
            {(["Cut", "Copy", "Paste"] as const).map((x) => (
              <button key={x} disabled={disabled} onClick={() => edit(x)}>
                {x}
              </button>
            ))}
          </div>
          <span>Total Word Count: {wordCount(answer.text || "")}</span>
        </div>
        <span className="sr-only" role="status">
          {editMessage}
        </span>
      </div>
    );
  if (g.kind === "single" || g.kind === "multi")
    return (
      <fieldset disabled={disabled} className="choices">
        <legend>{q.prompt || "Select the correct answer."}</legend>
        {q.options!.map((option, i) => (
          <label className="choice" key={i}>
            <input
              type={g.kind === "multi" ? "checkbox" : "radio"}
              name={q.id}
              checked={values.includes(String(i))}
              onChange={() =>
                g.kind === "multi" ? toggle(String(i)) : setValues([String(i)])
              }
            />
            <span>{option}</span>
          </label>
        ))}
      </fieldset>
    );
  if (g.kind === "highlight")
    return (
      <div
        className="highlight-text"
        aria-label="Select words that differ from the recording"
      >
        {q.text!.split(/\s+/).map((x, i) => (
          <span key={i}>
            <button
              disabled={disabled}
              className={values.includes(String(i)) ? "highlighted" : ""}
              aria-pressed={values.includes(String(i))}
              onClick={() => toggle(String(i))}
            >
              {x}
            </button>{" "}
          </span>
        ))}
      </div>
    );
  if (["bank", "blanks", "dropdown"].includes(g.kind))
    return (
      <TooltipProvider delay={150}>
        <div>
          <div className="gap-passage">
            {q.text!.split("{{}}").map((piece, i, all) => (
              <span key={i}>
                {piece}
                {i < all.length - 1 &&
                  (g.kind === "dropdown" ? (
                    <select
                      disabled={disabled}
                      aria-label={`Blank ${i + 1}`}
                      value={values[i] || ""}
                      onChange={(e) => setBlank(i, e.target.value)}
                    >
                      <option value="">Select…</option>
                      {q.blankOptions![i].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  ) : g.kind === "blanks" ? (
                    <input
                      disabled={disabled}
                      aria-label={`Blank ${i + 1}`}
                      value={values[i] || ""}
                      onChange={(e) => setBlank(i, e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  ) : (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            disabled={disabled}
                            className={`word-gap ${word ? "can-place" : ""}`}
                            aria-label={`Blank ${i + 1}${values[i] ? `: ${values[i]}` : ""}`}
                            aria-describedby={`${gapHintId}-${i}`}
                            onClick={() =>
                              word ? place(i, word) : setBlank(i, "")
                            }
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              place(i, e.dataTransfer.getData("text/plain"));
                            }}
                          />
                        }
                      >
                        {values[i] || " "}
                        {values[i] && !word && (
                          <span className="gap-clear" aria-hidden="true">
                            Clear
                          </span>
                        )}
                      </TooltipTrigger>
                      <span className="sr-only" id={`${gapHintId}-${i}`}>
                        {gapAction(i)}
                      </span>
                      <TooltipContent role="tooltip">
                        {gapAction(i)}
                      </TooltipContent>
                    </Tooltip>
                  ))}
              </span>
            ))}
          </div>
          {g.kind === "bank" && (
            <>
              <div className="word-bank" aria-label="Word bank">
                {q.options!.map((x) => (
                  <button
                    disabled={disabled || values.includes(x)}
                    aria-pressed={word === x}
                    draggable={!disabled && !values.includes(x)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", x);
                      setWord(x);
                    }}
                    onClick={() => setWord(word === x ? "" : x)}
                    key={x}
                  >
                    {x}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </TooltipProvider>
    );
  if (g.kind === "order")
    return (
      <div className="reorder">
        <section>
          <h3>Source</h3>
          {q.options!.map(
            (x, i) =>
              !values.includes(String(i)) && (
                <button
                  key={i}
                  disabled={disabled}
                  className={
                    selected === String(i) ? "paragraph selected" : "paragraph"
                  }
                  aria-pressed={selected === String(i)}
                  onClick={() => setSelected(String(i))}
                  draggable={!disabled}
                  onDragStart={(e) =>
                    e.dataTransfer.setData("text/plain", String(i))
                  }
                >
                  {x}
                </button>
              ),
          )}
        </section>
        <div className="reorder-transfer">
          <button
            aria-label="Move selected paragraph to answer"
            disabled={disabled || selected === null}
            onClick={() => selected !== null && insert(selected)}
          >
            <ArrowRight size={18} />
          </button>
          <button
            aria-label="Return last paragraph to source"
            disabled={disabled || !values.length}
            onClick={() => setValues(values.slice(0, -1))}
          >
            <ArrowLeft size={18} />
          </button>
        </div>
        <section
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData("text/plain");
            if (/^\d+$/.test(id) && q.options![+id] && !values.includes(id))
              insert(id);
          }}
        >
          <h3>Target</h3>
          {values.length === 0 && (
            <div className="drop-placeholder">
              Move the opening paragraph here.
            </div>
          )}
          {values.map((id, i) => (
            <div className="paragraph target" key={id}>
              <span>{q.options![+id]}</span>
              <div>
                <button
                  disabled={disabled || i === 0}
                  aria-label={`Move paragraph ${i + 1} up`}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  disabled={disabled || i === values.length - 1}
                  aria-label={`Move paragraph ${i + 1} down`}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  disabled={disabled}
                  aria-label={`Return paragraph ${i + 1} to source`}
                  onClick={() => setValues(values.filter((x) => x !== id))}
                >
                  <ArrowLeft size={16} />
                </button>
              </div>
            </div>
          ))}
        </section>
      </div>
    );
  return null;
}
