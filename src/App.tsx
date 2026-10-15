import { Badge } from "./components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./components/ui/dialog";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Download,
  Headphones,
  LayoutGrid,
  ListChecks,
  Mic,
  Search,
  ShieldCheck,
  Target,
  Trophy,
  WifiOff,
  X,
} from "lucide-react";
import {
  guides,
  questions,
  sections,
  mocks,
  guideFor,
  feedback,
  asset,
  type Guide,
  type Section,
  type Question,
  type Answer,
} from "./content";
import articles from "../content/learn.json";
import { Preflight, Runner, type PracticePlan, type Result } from "./Runner";
import { usePwa } from "./pwa";
import { readHistory, saveAttempt, loadAttempt, clearHistory } from "./storage";
import { Button } from "./components/ui/button";
const icons = { speaking: Mic, reading: BookOpen, listening: Headphones };
const releaseRecordings = (r: Result | null) => {
  if (r)
    Object.values(r.answers).forEach((a) => {
      if (a?.recording) URL.revokeObjectURL(a.recording);
    });
};
export default function App() {
  const [page, setPage] = useState(location.hash.slice(1) || "home");
  const [guideId, setGuideId] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [article, setArticle] = useState("what-is-pte");
  const [plan, setPlan] = useState<PracticePlan | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<Result[]>(readHistory);
  const [storageError, setStorageError] = useState("");
  const stream = useRef<MediaStream | null>(null);
  const pwa = usePwa();
  const main = useRef<HTMLElement>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  useEffect(() => {
    const route = () => {
      setPage(location.hash.slice(1) || "home");
      setGuideId("");
    };
    window.addEventListener("hashchange", route);
    return () => window.removeEventListener("hashchange", route);
  }, []);
  useEffect(() => {
    main.current?.focus();
    window.scrollTo(0, 0);
  }, [page, guideId, article, result, plan]);
  useEffect(
    () => () => stream.current?.getTracks().forEach((t) => t.stop()),
    [],
  );
  function navigate(to: string) {
    releaseRecordings(result);
    setResult(null);
    setGuideId("");
    setPage(to);
    location.hash = to;
  }
  function begin(mode: PracticePlan["mode"], id: string) {
    const qs =
      mode === "mock"
        ? mocks[0].questionIds.map((id) => questions.find((q) => q.id === id)!)
        : mode === "section"
          ? questions.filter((q) => guideFor(q).section === id)
          : questions.filter((q) => q.type === id);
    releaseRecordings(result);
    setResult(null);
    setPlan({
      mode,
      label:
        mode === "mock"
          ? mocks[0].title
          : mode === "section"
            ? `${sections.find((s) => s.id === id)!.title} practice`
            : guides.find((g) => g.id === id)!.title,
      questions: qs,
      minutes: mocks[0].sectionMinutes,
    });
  }
  function finish(r: Result) {
    setRunning(false);
    setPlan(null);
    setResult(r);
    setStorageError("");
    void saveAttempt(r)
      .then(setHistory)
      .catch(() =>
        setStorageError(
          "This attempt could not be saved on this device. You can still review it now.",
        ),
      );
  }
  async function openAttempt(id: string) {
    try {
      const saved = await loadAttempt(id);
      releaseRecordings(result);
      setResult(saved);
      setStorageError("");
    } catch (e) {
      setStorageError(
        e instanceof Error ? e.message : "Unable to open this attempt.",
      );
    }
  }
  async function removeHistory() {
    try {
      await clearHistory();
      setHistory([]);
      setClearConfirm(false);
      setStorageError("");
    } catch {
      setStorageError(
        "History could not be cleared. Check browser storage permissions.",
      );
      setClearConfirm(false);
    }
  }

  if (running && plan)
    return <Runner plan={plan} stream={stream.current} onComplete={finish} />;
  if (plan)
    return (
      <Preflight
        plan={plan}
        onStart={(s) => {
          stream.current = s;
          setRunning(true);
        }}
        onCancel={() => setPlan(null)}
      />
    );
  const currentGuide = guides.find((g) => g.id === guideId);
  const active = ["types", "sections", "mocks"].includes(page)
    ? page
    : page === "guide"
      ? "guide"
      : page === "history"
        ? "history"
        : "home";
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <a className="brand" href="#home" onClick={() => navigate("home")}>
          <img className="brand-symbol" src={asset("icon.svg")} alt="" />
          <span>
            PTE<span className="brand-light">studio</span>
            <small>ACADEMIC PRACTICE</small>
          </span>
        </a>
        <div className="nav-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          {[
            { id: "home", label: "Overview", icon: LayoutGrid },
            { id: "types", label: "Question types", icon: Target },
            { id: "sections", label: "Section practice", icon: ListChecks },
            { id: "mocks", label: "Mock tests", icon: Trophy },
          ].map((x) => (
            <a
              key={x.id}
              href={`#${x.id}`}
              onClick={() => navigate(x.id)}
              aria-current={active === x.id ? "page" : undefined}
            >
              <x.icon size={19} />
              {x.label}
              {active === x.id && <span className="nav-dot" />}
            </a>
          ))}
          <div className="nav-rule" />
          <a
            href="#guide"
            onClick={() => navigate("guide")}
            aria-current={active === "guide" ? "page" : undefined}
          >
            <BookOpen size={19} />
            Learn about PTE
          </a>
          <a
            href="#history"
            onClick={() => navigate("history")}
            aria-current={active === "history" ? "page" : undefined}
          >
            <Clock3 size={19} />
            My practice
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="private-label">
            <ShieldCheck size={16} /> Your practice stays yours
          </div>
          <p>
            No account. No uploads.
            <br />
            Just you, making progress.
          </p>
          <button onClick={() => void pwa.install()}>
            <Download size={16} />
            Install app <ArrowUpRight size={14} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace <ChevronRight size={13} />
            <span>
              {result
                ? "Practice review"
                : currentGuide?.title ||
                  {
                    home: "Overview",
                    types: "Question types",
                    sections: "Section practice",
                    mocks: "Mock tests",
                    guide: "Learn about PTE",
                    history: "My practice",
                  }[page] ||
                  "Overview"}
            </span>
          </div>
          <div className="topbar-right">
            <span className="availability">
              {pwa.offline ? (
                <WifiOff size={13} />
              ) : (
                <span className="status-dot" />
              )}
              {pwa.offline
                ? "Offline"
                : pwa.ready
                  ? "Offline ready"
                  : "Local-first practice"}
            </span>
            <a
              href="#guide"
              aria-label="Help and test guide"
              onClick={() => {
                setArticle("about");
                navigate("guide");
              }}
            >
              <CircleHelp size={19} />
            </a>
            <span className="avatar" aria-label="Your local workspace">
              Y
            </span>
          </div>
        </header>
        {pwa.error && (
          <div className="banner" role="alert">
            {pwa.error}
          </div>
        )}
        {pwa.update && (
          <div className="banner">
            A new practice pack is available.{" "}
            <button onClick={pwa.update}>Reload to update</button>
          </div>
        )}
        {storageError && (
          <div className="banner error" role="alert">
            {storageError}
          </div>
        )}
        <main
          id="main-content"
          className="main-content"
          ref={main}
          tabIndex={-1}
        >
          {result ? (
            <Review result={result} onBack={() => navigate("history")} />
          ) : currentGuide ? (
            <GuideDetail
              guide={currentGuide}
              onBack={() => setGuideId("")}
              onStart={() => begin("type", currentGuide.id)}
            />
          ) : active === "home" ? (
            <>
              <div className="page-kicker">A LITTLE PRACTICE, EVERY DAY</div>
              <div className="welcome-heading">
                <div>
                  <h1>
                    Your next chapter
                    <br />
                    starts with <em>practice.</em>
                  </h1>
                  <p className="lead">
                    Get to know the test. Find your rhythm.
                    <br />
                    Build the confidence to walk in ready.
                  </p>
                </div>
                <div className="chapter-mark" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="orbit orbit-three" />
                  <span>
                    a<span>b</span>c
                  </span>
                  <small>LEARN. PRACTISE. PROGRESS.</small>
                </div>
              </div>
              <section className="start-banner">
                <div className="start-icon">
                  <BookOpen size={25} />
                </div>
                <div>
                  <span className="eyebrow">NEW TO PTE ACADEMIC?</span>
                  <h2>Let’s start at the beginning.</h2>
                  <p>
                    What the test is, how it works, and what to practise first.
                  </p>
                </div>
                <Button
                  className="primary"
                  onClick={() => {
                    setArticle("what-is-pte");
                    navigate("guide");
                  }}
                >
                  Meet the test <ArrowRight size={17} />
                </Button>
              </section>
              <section className="practice-section">
                <div className="section-heading">
                  <h2>Choose your practice</h2>
                  <span>Three ways to move forward</span>
                </div>
                <div className="mode-grid">
                  {[
                    {
                      id: "types",
                      n: "01",
                      icon: Target,
                      title: "One question type",
                      text: "Break it down. Learn the approach, then practise a specific task.",
                      meta: "22 question types",
                      button: "Explore question types",
                    },
                    {
                      id: "sections",
                      n: "02",
                      icon: ListChecks,
                      title: "One test section",
                      text: "Connect the pieces. Build your focus across a complete section.",
                      meta: "3 test sections",
                      button: "Choose a section",
                    },
                    {
                      id: "mocks",
                      n: "03",
                      icon: Trophy,
                      title: "The whole experience",
                      text: "Bring it all together. Work through a full mock from start to finish.",
                      meta: "1 full mock · 65 questions",
                      button: "View mock tests",
                    },
                  ].map((x) => (
                    <a
                      href={`#${x.id}`}
                      onClick={() => navigate(x.id)}
                      className="mode-card"
                      key={x.id}
                    >
                      <div className="mode-card-top">
                        <span className={`mode-icon mode-${x.id}`}>
                          <x.icon size={23} />
                        </span>
                        <span className="mode-number">{x.n}</span>
                      </div>
                      <h3>{x.title}</h3>
                      <p>{x.text}</p>
                      <span className="mode-meta">{x.meta}</span>
                      <div className="mode-card-action">
                        {x.button}
                        <ArrowRight size={17} />
                      </div>
                    </a>
                  ))}
                </div>
              </section>
              <section className="test-map">
                <div>
                  <div className="eyebrow">THE TEST AT A GLANCE</div>
                  <h2>
                    Four skills.
                    <br />
                    One step at a time.
                  </h2>
                  <a
                    className="text-link"
                    href="#guide"
                    onClick={() => {
                      setArticle("test-day");
                      navigate("guide");
                    }}
                  >
                    Understand the test format <ArrowUpRight size={15} />
                  </a>
                </div>
                <div className="section-list">
                  {sections.map((s, i) => {
                    const Icon = icons[s.id];
                    return (
                      <button key={s.id} onClick={() => navigate("sections")}>
                        <span className="section-index">0{i + 1}</span>
                        <Icon size={19} />
                        <div>
                          <h3>{s.title}</h3>
                          <span>
                            {guides.filter((g) => g.section === s.id).length}{" "}
                            question types
                          </span>
                        </div>
                        <span className="section-duration">{s.duration}</span>
                        <ChevronRight size={15} />
                      </button>
                    );
                  })}
                </div>
              </section>
              <div className="quiet-note">
                <ShieldCheck size={16} />
                <span>
                  Original practice content. Independent learning. Your
                  progress, on your device.
                </span>
              </div>
            </>
          ) : active === "types" ? (
            <>
              <PageTitle
                kicker="BUILD THE FOUNDATIONS"
                title="One skill at a time."
                description="Understand the task, learn a useful approach, and put it into practice."
              />
              <div className="catalog-tools">
                <div className="filter-tabs" aria-label="Filter by section">
                  {[{ id: "all", title: "All types" }, ...sections].map((s) => (
                    <button
                      key={s.id}
                      aria-pressed={filter === s.id}
                      onClick={() => setFilter(s.id)}
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
                <label className="search">
                  <Search size={17} />
                  <input
                    type="search"
                    placeholder="Find a question type"
                    aria-label="Find a question type"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
              </div>
              <div className="type-list">
                {guides
                  .filter(
                    (g) =>
                      (filter === "all" || g.section === filter) &&
                      `${g.title} ${g.summary}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map((g) => {
                    const Icon = icons[g.section];
                    return (
                      <button
                        className="type-row"
                        key={g.id}
                        onClick={() => setGuideId(g.id)}
                      >
                        <span className={`type-icon ${g.section}`}>
                          <Icon size={20} />
                        </span>
                        <div>
                          <h2>{g.title}</h2>
                          <p>{g.summary}</p>
                        </div>
                        <span className="type-count">
                          {questions.filter((q) => q.type === g.id).length}{" "}
                          questions
                        </span>
                        <ChevronRight size={18} />
                      </button>
                    );
                  })}
                {guides.filter(
                  (g) =>
                    (filter === "all" || g.section === filter) &&
                    `${g.title} ${g.summary}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                ).length === 0 && (
                  <div className="empty-state">
                    <Search size={26} />
                    <h2>No question types found</h2>
                    <p>Try a different search or section.</p>
                    <Button
                      variant="outline"
                      className="secondary"
                      onClick={() => {
                        setSearch("");
                        setFilter("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  </div>
                )}
              </div>
            </>
          ) : active === "sections" ? (
            <>
              <PageTitle
                kicker="FIND YOUR FLOW"
                title="Practise a full section."
                description="Build familiarity with the sequence, the controls and the clock."
              />
              <div className="section-cards">
                {sections.map((s, i) => {
                  const Icon = icons[s.id];
                  const count = questions.filter(
                    (q) => guideFor(q).section === s.id,
                  ).length;
                  return (
                    <section className="section-card" key={s.id}>
                      <div className="section-card-title">
                        <span className={`type-icon ${s.id}`}>
                          <Icon size={24} />
                        </span>
                        <span className="mode-number">0{i + 1}</span>
                      </div>
                      <h2>{s.title}</h2>
                      <p>{s.description}</p>
                      <div className="section-card-meta">
                        <span>
                          <Clock3 size={15} />
                          {s.duration}
                        </span>
                        <span>{count} questions</span>
                      </div>
                      <details>
                        <summary>What you’ll practise</summary>
                        <ul>
                          {guides
                            .filter((g) => g.section === s.id)
                            .map((g) => (
                              <li key={g.id}>{g.title}</li>
                            ))}
                        </ul>
                      </details>
                      <Button
                        className="primary"
                        onClick={() => begin("section", s.id)}
                      >
                        Start section <ArrowRight size={16} />
                      </Button>
                    </section>
                  );
                })}
              </div>
              <p className="muted">
                Section practice uses the same original items as question drills
                and the full mock. Review explanations after the section ends.
              </p>
            </>
          ) : active === "mocks" ? (
            <>
              <PageTitle
                kicker="PUT IT ALL TOGETHER"
                title="A rehearsal for test day."
                description="Set aside uninterrupted time. Practise the full sequence and discover what to work on next."
              />
              <div className="mock-feature">
                <div className="mock-art" aria-hidden="true">
                  <div>01</div>
                  <span>
                    THE FULL
                    <br />
                    EXPERIENCE
                  </span>
                  <div className="mock-art-lines" />
                </div>
                <div className="mock-copy">
                  <Badge variant="outline">COMPLETE PRACTICE FORM</Badge>
                  <h2>Full mock 01</h2>
                  <p>{mocks[0].description}</p>
                  <div className="mock-stats">
                    <span>
                      <Clock3 size={17} />
                      Up to 149 minutes
                    </span>
                    <span>
                      <ListChecks size={17} />
                      65 questions
                    </span>
                    <span>
                      <Check size={17} />
                      All 22 types
                    </span>
                  </div>
                  <ol className="mock-sequence">
                    {sections.map((s) => (
                      <li key={s.id}>
                        {s.title}
                        <span>{mocks[0].sectionMinutes[s.id]} min limit</span>
                      </li>
                    ))}
                  </ol>
                  <Button
                    className="primary"
                    onClick={() => begin("mock", "mock-01")}
                  >
                    Prepare for mock <ArrowRight size={17} />
                  </Button>
                </div>
              </div>
              <div className="notice">
                This is one original practice form, shared with drills and
                section practice. Audio is synthetic and some prompts are
                shorter than live test prompts. Results provide answer feedback
                and self-review, without a predicted PTE score.
              </div>
            </>
          ) : active === "guide" ? (
            <>
              <PageTitle
                kicker="YOUR STARTING POINT"
                title="Hello, PTE Academic."
                description="No assumed knowledge. Just a clear introduction to what comes next."
              />
              <div className="learn-layout">
                <nav aria-label="Learning guide">
                  {articles.map((a) => (
                    <button
                      key={a.id}
                      aria-current={article === a.id ? "page" : undefined}
                      onClick={() => setArticle(a.id)}
                    >
                      {a.title}
                      <ChevronRight size={15} />
                    </button>
                  ))}
                </nav>
                <article className="learning-article">
                  <div className="eyebrow">
                    {articles.find((a) => a.id === article)!.tag}
                  </div>
                  <h2>{articles.find((a) => a.id === article)!.title}</h2>
                  <p className="article-intro">
                    {articles.find((a) => a.id === article)!.intro}
                  </p>
                  {articles
                    .find((a) => a.id === article)!
                    .blocks.map((b) => (
                      <section key={b.title}>
                        <h3>{b.title}</h3>
                        <p>{b.text}</p>
                      </section>
                    ))}
                  <Button className="primary" onClick={() => navigate("types")}>
                    Explore the question types <ArrowRight size={16} />
                  </Button>
                </article>
              </div>
            </>
          ) : (
            <>
              <PageTitle
                kicker="YOUR LEARNING, ON THIS DEVICE"
                title="Make your progress count."
                description="Return to your completed attempts and find one thing to improve next."
              />
              {history.length === 0 ? (
                <div className="empty-state">
                  <Target size={34} />
                  <h2>Your first attempt starts a habit.</h2>
                  <p>Complete a practice to see it here. No account needed.</p>
                  <Button className="primary" onClick={() => navigate("types")}>
                    Choose a question type <ArrowRight size={16} />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="history-list">
                    {history.map((r) => (
                      <button key={r.id} onClick={() => void openAttempt(r.id)}>
                        <div>
                          <h2>{r.label}</h2>
                          <span>
                            {new Date(r.date).toLocaleString("en-AU", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })}{" "}
                            · {r.finished ? "Completed" : "Ended early"}
                          </span>
                        </div>
                        <span>{r.questionIds.length} questions</span>
                        <ChevronRight size={18} />
                      </button>
                    ))}
                  </div>
                  <button
                    className="text-button danger"
                    onClick={() => setClearConfirm(true)}
                  >
                    Clear practice history
                  </button>
                </>
              )}
              <p className="muted">
                Up to 10 recent attempts are stored in this browser. Responses
                and recordings are stored in IndexedDB on this device.
              </p>
            </>
          )}
        </main>
        <footer className="site-footer">
          <span>
            PTE studio <span className="footer-divider">/</span> A little
            practice goes a long way.
          </span>
          <a
            href="#guide"
            onClick={() => {
              setArticle("about");
              navigate("guide");
            }}
          >
            About & privacy <ArrowUpRight size={13} />
          </a>
        </footer>
      </div>
      <Dialog open={clearConfirm} onOpenChange={setClearConfirm}>
        <DialogContent showCloseButton={false}>
          <DialogTitle>Clear your practice history?</DialogTitle>
          <DialogDescription>
            This removes completed text responses, recordings and attempt
            history from this browser.
          </DialogDescription>
          <div className="flex justify-end gap-3 pt-3">
            <Button variant="outline" onClick={() => setClearConfirm(false)}>
              Keep history
            </Button>
            <Button onClick={() => void removeHistory()}>Clear history</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function PageTitle({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-title">
      <div className="page-kicker">{kicker}</div>
      <h1>{title}</h1>
      <p className="lead">{description}</p>
    </div>
  );
}
function GuideDetail({
  guide: g,
  onBack,
  onStart,
}: {
  guide: Guide;
  onBack: () => void;
  onStart: () => void;
}) {
  return (
    <>
      <button className="text-button" onClick={onBack}>
        ← All question types
      </button>
      <PageTitle
        kicker={sections.find((s) => s.id === g.section)!.title.toUpperCase()}
        title={g.title}
        description={g.summary}
      />
      <div className="guide-layout">
        <div className="guide-body">
          <section>
            <h2>What you need to do</h2>
            <p>{g.instructions}</p>
            <div className="guide-facts">
              <span>
                <Clock3 size={17} />
                {g.prepSeconds ? `${g.prepSeconds}s preparation · ` : ""}
                {g.answerSeconds
                  ? `${g.answerSeconds >= 60 ? `${g.answerSeconds / 60} minutes` : `${g.answerSeconds} seconds`} to respond`
                  : "Shared section timer"}
              </span>
              <span>{g.skills}</span>
            </div>
          </section>
          <section>
            <h2>A useful approach</h2>
            <ol className="strategy-list">
              {g.tips.map((tip, i) => (
                <li key={tip}>
                  <span>0{i + 1}</span>
                  <p>{tip}</p>
                </li>
              ))}
            </ol>
          </section>
          <div className="pitfall">
            <h3>Watch out for this</h3>
            <p>{g.pitfall}</p>
          </div>
          <details className="scoring-detail">
            <summary>How to review your response</summary>
            <p>{g.scoring}</p>
            <p>
              For an open response, compare your work with the model and check
              these qualities yourself. There is no automated proficiency
              assessment.
            </p>
          </details>
        </div>
        <aside className="guide-start">
          <Badge variant="outline">FOCUSED PRACTICE</Badge>
          <h2>Give it a go.</h2>
          <p>
            {questions.filter((q) => q.type === g.id).length} original
            questions.
            <br />
            One clear thing to work on.
          </p>
          <Button className="primary" onClick={onStart}>
            Start practice <ArrowRight size={16} />
          </Button>
          <small>Answers and explanations appear after you finish.</small>
        </aside>
      </div>
    </>
  );
}
function showAnswer(q: Question, a: Answer) {
  const g = guideFor(q);
  if (a.text) return a.text;
  if (a.values?.length) {
    if (["single", "multi", "order"].includes(g.kind))
      return a.values
        .map((x) => q.options?.[+x])
        .filter(Boolean)
        .join("\n");
    if (g.kind === "highlight")
      return a.values.map((x) => q.text!.split(/\s+/)[+x]).join(", ");
    return a.values.join(" · ");
  }
  return a.recording ? "Recording below" : "No response";
}
function modelAnswer(q: Question) {
  const g = guideFor(q);
  if (q.model) return q.model;
  if (["single", "multi", "order"].includes(g.kind))
    return q.answers!.map((x) => q.options![+x]).join("\n");
  if (g.kind === "highlight")
    return q.answers!.map((x) => q.text!.split(/\s+/)[+x]).join(", ");
  return q.answers?.join(" · ");
}
function Review({ result: r, onBack }: { result: Result; onBack: () => void }) {
  return (
    <>
      <button className="text-button" onClick={onBack}>
        ← My practice
      </button>
      <PageTitle
        kicker={r.finished ? "PRACTICE COMPLETE" : "ATTEMPT ENDED"}
        title="A little wiser than before."
        description={`${r.label} · Review your responses, then choose one thing to improve.`}
      />
      <div className="notice">
        This review provides answer keys and self-review guidance. It does not
        produce or predict an official PTE score. Responses and recordings are
        saved on this device when browser storage is available.
      </div>
      <div className="review-list">
        {r.questionIds.map((id, i) => {
          const q = questions.find((x) => x.id === id)!;
          const a = r.answers[id] || {};
          const f = feedback(q, a);
          return (
            <details key={id} className="review-item">
              <summary>
                <span className="review-number">{i + 1}</span>
                <span>
                  <strong>{guideFor(q).title}</strong>
                  <small>{q.title}</small>
                </span>
                <span
                  className={`feedback-label ${f.label === "Correct" || f.label === "Exact match" ? "correct" : ""}`}
                >
                  {f.label}
                </span>
                <ChevronRight size={17} />
              </summary>
              <div className="review-content">
                <p>{f.detail}</p>
                {q.text && (
                  <>
                    <h3>Original prompt</h3>
                    <p>{q.text}</p>
                  </>
                )}
                <h3>Your response</h3>
                <p className="answer-text">{showAnswer(q, a)}</p>
                {a.recording && (
                  <audio
                    controls
                    src={a.recording}
                    aria-label={`Your recording for question ${i + 1}`}
                  />
                )}
                <h3>
                  {guideFor(q).kind === "write" || guideFor(q).kind === "speak"
                    ? "Model / key points"
                    : "Answer key"}
                </h3>
                <p className="answer-text">{modelAnswer(q)}</p>
                <h3>Why this works</h3>
                <p>{q.explanation}</p>
                {q.audioText && (
                  <details>
                    <summary>Read the audio transcript</summary>
                    <p>{q.audioText}</p>
                  </details>
                )}
                <details>
                  <summary>Review the strategy</summary>
                  <ul>
                    {guideFor(q).tips.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </details>
              </div>
            </details>
          );
        })}
      </div>
    </>
  );
}
