import { Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  BookOpen,
  ChevronRight,
  Mic,
  Headphones,
  Play,
  Target,
  Check,
  History,
  Trash2,
  Info,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { ReadingPages } from "./Pages";
import { CardsList } from "./components/CardsList";
import {
  guides,
  questions,
  sections,
  guideFor,
  type Guide,
  type Section,
} from "./content";
import articles from "../content/learn.json";
import type { Progress } from "./progress";
import type { Result } from "./Runner";
import { TrackProgress } from "./GameHub";
const icons = { speaking: Mic, reading: BookOpen, listening: Headphones };
export function Catalogue({
  selectedSections,
  search,
  progress,
  onSelect,
  index,
  onIndex,
}: {
  selectedSections: Section[];
  search: string;
  progress: Progress;
  onSelect: (id: string) => void;
  index: number;
  onIndex: (index: number) => void;
}) {
  const filtered = guides.filter(
    (g) =>
      selectedSections.includes(g.section) &&
      `${g.title} ${g.summary}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <CardsList
      key={selectedSections.join(",") + search}
      items={filtered}
      index={index}
      onIndex={onIndex}
      label="question type pages"
      empty={<p className="empty-state">No question types found.</p>}
      render={(g) => {
        const Icon = icons[g.section];
        return (
          <button
            key={g.id}
            className="type-row"
            data-track={g.section}
            onClick={() => onSelect(g.id)}
          >
            <span className="type-icon">
              <Icon />
            </span>
            <span className="flex-1 text-left">{g.title}</span>
            {questions.some(
              (q) => q.type === g.id && progress.seen.includes(q.id),
            ) && <Check aria-label="Practised" />}
            <Badge variant="secondary">
              {questions.filter((q) => q.type === g.id).length}
            </Badge>
            <ChevronRight />
          </button>
        );
      }}
    />
  );
}
export function SectionSelect({
  progress,
  onStart,
  sectionId,
  onSelect,
}: {
  sectionId?: string;
  onSelect: (id: string) => void;
  progress: Progress;
  onStart: (id: string) => void;
}) {
  const selected = Math.max(
    0,
    sections.findIndex((s) => s.id === sectionId),
  );
  const [details, setDetails] = useState(false);
  const section = sections[selected],
    Icon = icons[section.id];
  return (
    <div className="section-select screen-stack">
      <div className="screen-tabs" role="group" aria-label="Choose a section">
        {sections.map((s, i) => {
          const I = icons[s.id];
          return (
            <Button
              key={s.id}
              variant={i === selected ? "secondary" : "outline"}
              aria-label={s.title}
              aria-pressed={i === selected}
              onClick={() => {
                onSelect(s.id);
                setDetails(false);
              }}
            >
              <I />
              <span>{s.title.replace("Speaking & Writing", "Speaking")}</span>
            </Button>
          );
        })}
      </div>
      <section className="section-stage" data-track={section.id}>
        <div className="section-details-action">
          <Button
            variant="outline"
            size="icon"
            aria-label="Section details"
            aria-pressed={details}
            onClick={() => setDetails(!details)}
          >
            <Info />
          </Button>
        </div>
        {!details && <Icon className="stage-icon" />}
        <h2>{section.title}</h2>
        <p>
          {section.duration} ·{" "}
          {questions.filter((q) => guideFor(q).section === section.id).length}{" "}
          questions
        </p>
        {details ? (
          <ReadingPages
            key={section.id}
            texts={[
              section.description,
              guides
                .filter((g) => g.section === section.id)
                .map((g) => g.title)
                .join(" · "),
            ]}
            label="section information pages"
          />
        ) : (
          <TrackProgress progress={progress} section={section.id} />
        )}
        <Button
          className="big-play"
          aria-label={`Start ${section.title} practice`}
          onClick={() => onStart(section.id)}
        >
          <Play />
          Start section
        </Button>
      </section>
    </div>
  );
}
export function LearnScreen({
  onPractice,
  topic,
  onTopic,
}: {
  onPractice: () => void;
  topic?: string;
  onTopic: (id?: string) => void;
}) {
  const [block, setBlock] = useState(-1);
  const article = articles.find((a) => a.id === topic);
  if (!article)
    return (
      <div className="screen-stack">
        <h2 className="screen-title">Learn about PTE.</h2>
        <CardsList
          items={articles}
          label="learning topics"
          render={(a) => (
            <button
              className="type-row"
              key={a.id}
              onClick={() => {
                onTopic(a.id);
                setBlock(-1);
              }}
            >
              <BookOpen />
              <span className="flex-1 text-left">{a.title}</span>
              <ChevronRight />
            </button>
          )}
        />
      </div>
    );
  return (
    <div className="screen-stack lesson-screen">
      <div className="screen-toolbar">
        <Button
          variant="outline"
          aria-label="All learning topics"
          onClick={() => onTopic()}
        >
          Back
        </Button>
        <Button variant="outline" onClick={onPractice}>
          <Target />
          Practise
        </Button>
      </div>
      <h2 className="screen-title">{article.title}</h2>
      <label className="topic-select">
        <span className="sr-only">Learning topic</span>
        <select
          aria-label="Learning topic"
          value={block}
          onChange={(e) => setBlock(+e.target.value)}
        >
          <option value={-1}>Overview</option>
          {article.blocks.map((b, i) => (
            <option key={b.title} value={i}>
              {b.title}
            </option>
          ))}
        </select>
      </label>
      <ReadingPages
        key={article.id + block}
        texts={[block < 0 ? article.intro : article.blocks[block].text]}
      />
    </div>
  );
}
export function GuideScreen({
  guide: g,
  onStart,
}: {
  guide: Guide;
  onStart: () => void;
}) {
  const [tab, setTab] = useState("Instructions");
  const texts =
    tab === "Instructions"
      ? [
          g.instructions,
          `${g.prepSeconds ? g.prepSeconds + "s preparation. " : ""}${g.answerSeconds ? g.answerSeconds + "s response." : "Shared section timer."} ${g.skills}`,
        ]
      : tab === "Strategy & tips"
        ? [...g.tips, g.pitfall]
        : [g.scoring];
  return (
    <div className="screen-stack guide-screen">
      <div className="guide-start">
        <p>{questions.filter((q) => q.type === g.id).length} questions</p>
        <Button
          className="big-play"
          aria-label="Start practice"
          onClick={onStart}
        >
          <Play />
          Start
        </Button>
      </div>
      <div className="screen-tabs" role="group" aria-label="Question guidance">
        {["Instructions", "Strategy & tips", "How to review"].map((t) => (
          <Button
            key={t}
            variant={t === tab ? "secondary" : "outline"}
            aria-pressed={t === tab}
            onClick={() => setTab(t)}
          >
            {t}
          </Button>
        ))}
      </div>
      <ReadingPages key={g.id + tab} texts={texts} />
    </div>
  );
}
export function HistoryScreen({
  history,
  onClear,
  onPractice,
}: {
  history: Result[];
  onClear: () => void;
  onPractice: () => void;
}) {
  return (
    <div className="screen-stack">
      <div className="screen-toolbar">
        <h2 className="screen-title">Your sessions.</h2>
        {!!history.length && (
          <Button
            variant="outline"
            size="icon"
            aria-label="Clear practice history"
            onClick={onClear}
          >
            <Trash2 />
          </Button>
        )}
      </div>
      <CardsList
        items={history}
        minCardHeight={112}
        maxCardHeight={136}
        className="history-list"
        label="attempt pages"
        empty={
          <div className="empty-state">
            <History />
            <p>No attempts yet.</p>
            <Button onClick={onPractice}>
              <Play />
              Practise
            </Button>
          </div>
        }
        render={(r) => (
          <Link
            key={r.id}
            className="type-row history-row"
            to="/history/$attemptId"
            params={{ attemptId: r.id }}
          >
            <History />
            <span className="flex-1 text-left">
              {r.label}
              <small>
                {new Date(r.date).toLocaleString("en-AU", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </small>
            </span>
            <Badge variant="secondary">{r.questionIds.length}</Badge>
            <ChevronRight />
          </Link>
        )}
      />
    </div>
  );
}
