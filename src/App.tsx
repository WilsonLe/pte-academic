import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CloudCheck,
  Download,
  Headphones,
  History,
  House,
  Info,
  ListChecks,
  Mic,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  Trash2,
  Trophy,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import {
  guides,
  questions,
  sections,
  mocks,
  guideFor,
  feedback,
  asset,
  type Guide,
  type Question,
  type Answer,
} from "./content";
import articles from "../content/learn.json";
import { Preflight, Runner, type PracticePlan, type Result } from "./Runner";
import { readHistory, saveAttempt, loadAttempt, clearHistory } from "./storage";
import { usePwa } from "./pwa";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "./components/ui/tooltip";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./components/ui/accordion";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "./components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./components/ui/dialog";
import { Toaster } from "./components/ui/sonner";
import { Chart } from "./QuestionInput";
const navigation = [
  { id: "home", label: "Practice", icon: House },
  { id: "types", label: "Question types", icon: Target },
  { id: "sections", label: "Section practice", icon: ListChecks },
  { id: "mocks", label: "Mock tests", icon: Trophy },
  { id: "guide", label: "Learn about PTE", icon: BookOpen },
  { id: "history", label: "My practice", icon: History },
];
const icons = { speaking: Mic, reading: BookOpen, listening: Headphones };
const titles: Record<string, string> = {
  home: "Practice",
  types: "Question types",
  sections: "Sections",
  mocks: "Mock tests",
  guide: "Learn",
  history: "History",
};
const releaseRecordings = (r: Result | null) => {
  if (r)
    Object.values(r.answers).forEach((a) => {
      if (a.recording) URL.revokeObjectURL(a.recording);
    });
};
function IconAction({
  label,
  icon: Icon,
  onClick,
  disabled = false,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            onClick={onClick}
            disabled={disabled}
          />
        }
      >
        <Icon className="size-4" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
function More({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Collapsible className="more">
      <CollapsibleTrigger
        className="group flex min-h-10 items-center gap-2 text-xs text-muted-foreground"
        aria-label={label}
      >
        <Info className="size-3.5" />
        {label}
        <ChevronDown className="size-3.5 transition-transform duration-200 group-data-open:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="disclosure-panel">
        <div className="pb-4 pt-2 text-sm leading-7 text-muted-foreground">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
function Nav({
  active,
  navigate,
  mobile = false,
}: {
  active: string;
  navigate: (id: string) => void;
  mobile?: boolean;
}) {
  return (
    <nav
      aria-label={mobile ? "Mobile navigation" : "Main navigation"}
      className={mobile ? "mobile-nav" : "desktop-nav"}
    >
      {navigation.map((n) => (
        <Tooltip key={n.id}>
          <TooltipTrigger
            render={
              <a
                href={`#${n.id}`}
                aria-label={n.label}
                aria-current={active === n.id ? "page" : undefined}
                onClick={() => navigate(n.id)}
                className="nav-icon"
              />
            }
          >
            <n.icon className="size-[19px]" />
          </TooltipTrigger>
          <TooltipContent side={mobile ? "top" : "right"}>
            {n.label}
          </TooltipContent>
        </Tooltip>
      ))}
    </nav>
  );
}
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
  const [saving, setSaving] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const stream = useRef<MediaStream | null>(null);
  const main = useRef<HTMLElement>(null);
  const pwa = usePwa();
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
    setSaving(true);
    void saveAttempt(r)
      .then((rows) => {
        setHistory(rows);
        toast.success("Practice saved");
      })
      .catch(() => {
        setStorageError(
          "This attempt could not be saved. You can review it now.",
        );
        toast.error("Unable to save this attempt");
      })
      .finally(() => setSaving(false));
  }
  async function openAttempt(id: string) {
    try {
      const saved = await loadAttempt(id);
      releaseRecordings(result);
      setResult(saved);
      setStorageError("");
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Unable to open this attempt.";
      setStorageError(message);
      toast.error(message);
    }
  }
  async function removeHistory() {
    try {
      await clearHistory();
      setHistory([]);
      setClearConfirm(false);
      setStorageError("");
      toast.success("History cleared");
    } catch {
      setStorageError(
        "History could not be cleared. Check browser storage permissions.",
      );
      setClearConfirm(false);
      toast.error("Unable to clear history");
    }
  }
  const currentGuide = guides.find((g) => g.id === guideId);
  const active = titles[page] ? page : "home";
  const title = result ? "Review" : currentGuide?.title || titles[active];
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
  const filtered = guides.filter(
    (g) =>
      (filter === "all" || g.section === filter) &&
      `${g.title} ${g.summary}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <TooltipProvider delay={150}>
      <div className="app-shell">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <aside className="sidebar" aria-label="Sidebar">
          <a
            href="#home"
            className="rail-logo"
            aria-label="PTE Studio home"
            onClick={() => navigate("home")}
          >
            <img src={asset("icon.svg")} alt="" className="size-9 rounded-xl" />
          </a>
          <Nav active={active} navigate={navigate} />
          <div className="mt-auto">
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    tabIndex={0}
                    aria-label="Your practice stays on this device"
                    className="nav-icon text-muted-foreground"
                  />
                }
              >
                <ShieldCheck className="size-4" />
              </TooltipTrigger>
              <TooltipContent side="right">
                Responses stay on this device.
              </TooltipContent>
            </Tooltip>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="flex min-w-0 items-center gap-3">
              <a
                href="#home"
                aria-label="PTE Studio home"
                className="md:hidden"
                onClick={() => navigate("home")}
              >
                <img
                  src={asset("icon.svg")}
                  alt=""
                  className="size-8 rounded-lg"
                />
              </a>
              {(result || currentGuide) && (
                <IconAction
                  label={result ? "My practice" : "All question types"}
                  icon={ArrowLeft}
                  onClick={() =>
                    result ? navigate("history") : setGuideId("")
                  }
                />
              )}
              <h1 className="truncate text-sm font-medium tracking-normal">
                {title}
              </h1>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span
                      tabIndex={0}
                      role="status"
                      aria-label={
                        pwa.offline
                          ? "Offline"
                          : pwa.ready
                            ? "Offline ready"
                            : "Preparing offline pack"
                      }
                      className="flex size-8 items-center justify-center text-muted-foreground"
                    />
                  }
                >
                  {pwa.offline ? (
                    <WifiOff className="size-4" />
                  ) : (
                    <CloudCheck className="size-4" />
                  )}
                </TooltipTrigger>
                <TooltipContent>
                  {pwa.offline
                    ? "Offline"
                    : pwa.ready
                      ? "Offline ready"
                      : "Preparing offline pack"}
                </TooltipContent>
              </Tooltip>
              {pwa.update && (
                <IconAction
                  label={
                    saving
                      ? "Saving practice before update"
                      : "Reload to update"
                  }
                  icon={RefreshCw}
                  disabled={saving}
                  onClick={pwa.update}
                />
              )}
              <IconAction
                label="Install app"
                icon={Download}
                onClick={() => {
                  void pwa.install().then((message) => {
                    if (message) toast.info(message, { duration: 10000 });
                  });
                }}
              />
              <IconAction
                label="Learn about PTE"
                icon={Info}
                onClick={() => navigate("guide")}
              />
            </div>
          </header>
          {(storageError || pwa.error) && (
            <div
              className="border-b bg-destructive/5 px-5 py-3 text-xs text-destructive"
              role="alert"
            >
              {storageError || pwa.error}
            </div>
          )}
          <main
            ref={main}
            id="main-content"
            tabIndex={-1}
            className="main-content"
          >
            <div
              key={result?.id || guideId || `${active}-${article}`}
              className="page-enter"
            >
              {result ? (
                <Review result={result} />
              ) : currentGuide ? (
                <GuideDetail
                  guide={currentGuide}
                  onStart={() => begin("type", currentGuide.id)}
                />
              ) : active === "home" ? (
                <div className="max-w-3xl">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { id: "types", label: "Question types", icon: Target },
                      { id: "sections", label: "Sections", icon: ListChecks },
                      { id: "mocks", label: "Mock tests", icon: Trophy },
                    ].map((n) => (
                      <a
                        href={`#${n.id}`}
                        key={n.id}
                        onClick={() => navigate(n.id)}
                        className="practice-choice"
                      >
                        <n.icon className="size-5" />
                        <span>{n.label}</span>
                        <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                      </a>
                    ))}
                  </div>
                  <div className="mt-6">
                    <More label="New to PTE Academic?">
                      <p>
                        PTE Academic tests speaking, writing, reading and
                        listening on a computer. Start with one question type,
                        move to a section, then try a full mock.
                      </p>
                      <Button
                        variant="outline"
                        className="mt-3"
                        onClick={() => navigate("guide")}
                      >
                        <BookOpen />
                        Learn the basics
                      </Button>
                    </More>
                  </div>
                </div>
              ) : active === "types" ? (
                <>
                  <div className="mb-5 flex flex-wrap items-center gap-3">
                    <div
                      className="flex rounded-lg bg-muted p-1"
                      aria-label="Filter by section"
                    >
                      {[
                        { id: "all", label: "All", icon: Target },
                        ...sections.map((s) => ({
                          id: s.id,
                          label: s.title,
                          icon: icons[s.id],
                        })),
                      ].map((s) => (
                        <Tooltip key={s.id}>
                          <TooltipTrigger
                            render={
                              <Button
                                size="icon"
                                variant={
                                  filter === s.id ? "secondary" : "ghost"
                                }
                                aria-label={`Filter: ${s.label}`}
                                aria-pressed={filter === s.id}
                                onClick={() => setFilter(s.id)}
                              />
                            }
                          >
                            <s.icon className="size-4" />
                          </TooltipTrigger>
                          <TooltipContent>{s.label}</TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                    <label className="flex min-w-40 flex-1 items-center gap-2 rounded-lg border px-3">
                      <Search className="size-4 text-muted-foreground" />
                      <input
                        type="search"
                        aria-label="Find a question type"
                        placeholder="Search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
                      />
                    </label>
                  </div>
                  <div className="divide-y rounded-xl border">
                    {filtered.map((g) => {
                      const Icon = icons[g.section];
                      return (
                        <button
                          key={g.id}
                          className="type-row"
                          onClick={() => setGuideId(g.id)}
                        >
                          <Icon className="size-4 text-muted-foreground" />
                          <span className="flex-1 text-left">{g.title}</span>
                          <Badge variant="secondary" className="tabular-nums">
                            {questions.filter((q) => q.type === g.id).length}
                          </Badge>
                          <ChevronRight className="size-4 text-muted-foreground" />
                        </button>
                      );
                    })}
                    {filtered.length === 0 && (
                      <div className="p-8 text-center text-sm">
                        <p className="mb-3 text-muted-foreground">
                          No question types found.
                        </p>
                        <Button
                          variant="outline"
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
                <div className="max-w-3xl space-y-3">
                  {sections.map((s) => {
                    const Icon = icons[s.id];
                    const count = questions.filter(
                      (q) => guideFor(q).section === s.id,
                    ).length;
                    return (
                      <section
                        key={s.id}
                        className="section-card rounded-xl border px-4"
                      >
                        <div className="flex min-h-18 items-center gap-3">
                          <Icon className="size-5 text-muted-foreground" />
                          <h2 className="flex-1 text-sm font-medium">
                            {s.title}
                          </h2>
                          <Badge variant="secondary">{count}</Badge>
                          <IconAction
                            label={`Start ${s.title} practice`}
                            icon={Play}
                            onClick={() => begin("section", s.id)}
                          />
                        </div>
                        <More label={`${s.title} details`}>
                          <p className="mb-2 text-xs">
                            {s.duration} · {count} questions
                          </p>
                          <p>{s.description}</p>
                          <ul className="mt-3 space-y-1 text-xs">
                            {guides
                              .filter((g) => g.section === s.id)
                              .map((g) => (
                                <li key={g.id}>{g.title}</li>
                              ))}
                          </ul>
                        </More>
                      </section>
                    );
                  })}
                </div>
              ) : active === "mocks" ? (
                <section className="max-w-3xl rounded-xl border px-4">
                  <div className="flex min-h-20 items-center gap-3">
                    <Trophy className="size-5 text-muted-foreground" />
                    <h2 className="flex-1 text-sm font-medium">Mock 01</h2>
                    <Badge variant="secondary">65</Badge>
                    <IconAction
                      label="Prepare for mock"
                      icon={Play}
                      onClick={() => begin("mock", "mock-01")}
                    />
                  </div>
                  <More label="Mock details">
                    <p className="mb-3">
                      One original 65-question form, covering all 22 question
                      types. Items are shared with drills and section practice.
                    </p>
                    <ul className="space-y-2 text-xs">
                      {sections.map((s) => (
                        <li key={s.id} className="flex justify-between">
                          <span>{s.title}</span>
                          <span>{mocks[0].sectionMinutes[s.id]} min limit</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-4 text-xs">
                      Synthetic prompts may be shorter than live test prompts.
                      Speaking and extended writing use self-review. Exact
                      live-test UI parity is unverified.
                    </p>
                  </More>
                </section>
              ) : active === "guide" ? (
                <div className="learn-layout">
                  <nav
                    aria-label="Learning guide"
                    className="flex flex-wrap gap-1 lg:flex-col"
                  >
                    {articles.map((a) => (
                      <Button
                        key={a.id}
                        variant={article === a.id ? "secondary" : "ghost"}
                        className="h-auto justify-start whitespace-normal py-2 text-left text-xs"
                        aria-current={article === a.id ? "page" : undefined}
                        onClick={() => setArticle(a.id)}
                      >
                        {a.title}
                      </Button>
                    ))}
                  </nav>
                  <article className="min-w-0">
                    <h2 className="mb-4 text-base font-medium">
                      {articles.find((a) => a.id === article)!.title}
                    </h2>
                    <p className="mb-5 text-sm leading-7 text-muted-foreground">
                      {articles.find((a) => a.id === article)!.intro}
                    </p>
                    <Accordion multiple>
                      {articles
                        .find((a) => a.id === article)!
                        .blocks.map((b) => (
                          <AccordionItem key={b.title} value={b.title}>
                            <AccordionTrigger>{b.title}</AccordionTrigger>
                            <AccordionContent className="text-muted-foreground">
                              <p className="leading-7">{b.text}</p>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                    </Accordion>
                    <Button
                      variant="outline"
                      className="mt-6"
                      onClick={() => navigate("types")}
                    >
                      <Target />
                      Question types
                    </Button>
                  </article>
                </div>
              ) : (
                <div className="max-w-3xl">
                  {history.length === 0 ? (
                    <div className="flex flex-col items-center gap-4 py-12 text-sm text-muted-foreground">
                      <History className="size-7" />
                      <p>No attempts yet.</p>
                      <Button
                        variant="outline"
                        onClick={() => navigate("types")}
                      >
                        <Play />
                        Practise
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="mb-3 flex justify-end">
                        <IconAction
                          label="Clear practice history"
                          icon={Trash2}
                          onClick={() => setClearConfirm(true)}
                        />
                      </div>
                      <div className="history-list divide-y rounded-xl border">
                        {history.map((r) => (
                          <button
                            key={r.id}
                            className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-muted/50"
                            onClick={() => void openAttempt(r.id)}
                          >
                            <History className="size-4 text-muted-foreground" />
                            <span className="flex-1 text-sm">
                              {r.label}
                              <small className="mt-1 block text-[11px] text-muted-foreground">
                                {new Date(r.date).toLocaleString("en-AU", {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })}
                              </small>
                            </span>
                            <Badge variant="secondary">
                              {r.questionIds.length}
                            </Badge>
                            <ChevronRight className="size-4 text-muted-foreground" />
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  <More label="On-device storage">
                    <p className="text-xs">
                      Up to 10 attempts and their recordings stay in this
                      browser. localStorage stores the index; IndexedDB stores
                      responses. Nothing is uploaded. Clear history to remove
                      them.
                    </p>
                  </More>
                </div>
              )}
            </div>
          </main>
        </div>
        <Nav active={active} navigate={navigate} mobile />
        <Dialog open={clearConfirm} onOpenChange={setClearConfirm}>
          <DialogContent showCloseButton={false}>
            <DialogTitle>Clear your practice history?</DialogTitle>
            <DialogDescription>
              This removes responses, recordings and attempt history from this
              browser.
            </DialogDescription>
            <div className="flex justify-end gap-3 pt-3">
              <Button variant="outline" onClick={() => setClearConfirm(false)}>
                Keep history
              </Button>
              <Button onClick={() => void removeHistory()}>
                Clear history
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Toaster theme="light" position="top-center" />
      </div>
    </TooltipProvider>
  );
}
function GuideDetail({
  guide: g,
  onStart,
}: {
  guide: Guide;
  onStart: () => void;
}) {
  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center gap-3 rounded-xl border p-4">
        <span className="flex-1 text-xs text-muted-foreground">
          {questions.filter((q) => q.type === g.id).length} questions
        </span>
        <Tooltip>
          <TooltipTrigger
            render={<Button aria-label="Start practice" onClick={onStart} />}
          >
            <Play className="size-4" />
            Start
          </TooltipTrigger>
          <TooltipContent>Start {g.title} practice</TooltipContent>
        </Tooltip>
      </div>
      <Accordion multiple>
        <AccordionItem value="instructions">
          <AccordionTrigger>Instructions</AccordionTrigger>
          <AccordionContent>
            <p className="mb-3 leading-7 text-muted-foreground">
              {g.instructions}
            </p>
            <p className="text-xs text-muted-foreground">
              {g.prepSeconds ? `${g.prepSeconds}s preparation · ` : ""}
              {g.answerSeconds
                ? `${g.answerSeconds >= 60 ? `${g.answerSeconds / 60} min` : `${g.answerSeconds}s`} response`
                : "Shared section timer"}{" "}
              · {g.skills}
            </p>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="strategy">
          <AccordionTrigger>Strategy & tips</AccordionTrigger>
          <AccordionContent>
            <ol className="list-decimal space-y-3 pl-5 text-muted-foreground">
              {g.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
            <p className="mt-4 rounded-lg bg-muted p-3 text-xs">{g.pitfall}</p>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="feedback">
          <AccordionTrigger>How to review</AccordionTrigger>
          <AccordionContent>
            <p className="leading-7 text-muted-foreground">{g.scoring}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              Compare an open response with the model. This app does not predict
              a PTE score.
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
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
function Review({ result: r }: { result: Result }) {
  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm">{r.label}</span>
        <Badge variant="secondary">
          {r.finished ? "Completed" : "Ended early"}
        </Badge>
      </div>
      <More label="About feedback">
        <p className="text-xs">
          Answer keys and self-review guidance are provided, without a predicted
          PTE score. Responses and recordings are saved on this device when
          browser storage is available.
        </p>
      </More>
      <Accordion multiple className="review-list">
        {r.questionIds.map((id, i) => {
          const q = questions.find((x) => x.id === id)!;
          const a = r.answers[id] || {};
          const f = feedback(q, a);
          const correct = ["Correct", "Exact match"].includes(f.label);
          return (
            <AccordionItem key={id} value={id} className="review-item">
              <AccordionTrigger className="items-center gap-3">
                <span className="w-5 text-xs tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <span className="flex-1 text-left text-xs">
                  {guideFor(q).title}
                </span>
                <span className="sr-only">{f.label}</span>
                {correct ? (
                  <Check className="size-4" />
                ) : (
                  <Info className="size-4 text-muted-foreground" />
                )}
              </AccordionTrigger>
              <AccordionContent className="review-content">
                <p className="mb-4 text-xs text-muted-foreground">{f.detail}</p>
                {q.chart && <Chart q={q} />}
                <div className="grid gap-5 sm:grid-cols-2">
                  <section>
                    <h3 className="mb-2 text-xs font-medium">Your response</h3>
                    <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                      {showAnswer(q, a)}
                    </p>
                    {a.recording && (
                      <audio
                        controls
                        src={a.recording}
                        aria-label={`Your recording for question ${i + 1}`}
                        className="mt-3 max-w-full"
                      />
                    )}
                  </section>
                  <section>
                    <h3 className="mb-2 text-xs font-medium">
                      {["write", "speak"].includes(guideFor(q).kind)
                        ? "Model / key points"
                        : "Answer key"}
                    </h3>
                    <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                      {modelAnswer(q)}
                    </p>
                  </section>
                </div>
                <p className="mt-5 text-sm leading-7">{q.explanation}</p>
                {q.text && (
                  <More label="Original prompt">
                    <p>{q.text}</p>
                  </More>
                )}
                {q.audioText && (
                  <More label="Read the audio transcript">
                    <p>{q.audioText}</p>
                  </More>
                )}
                <More label="Review the strategy">
                  <ul className="list-disc space-y-2 pl-4">
                    {guideFor(q).tips.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </More>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
