import {
  Children,
  isValidElement,
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
  CloudCheck,
  Download,
  Headphones,
  History,
  House,
  Info,
  Image as ImageIcon,
  ListChecks,
  Mic,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
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
  type Question,
  type Answer,
  type Section,
} from "./content";
import {
  Catalogue,
  SectionSelect,
  LearnScreen,
  GuideScreen,
  HistoryScreen,
} from "./LearningScreens";
import { Pager, ReadingPages } from "./Pages";
import { Preflight, Runner, type PracticePlan, type Result } from "./Runner";
import {
  readHistory,
  saveAttempt,
  loadAttempt,
  clearHistory,
  loadProgress,
} from "./storage";
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
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./components/ui/dialog";
import { Toaster } from "./components/ui/sonner";
import { GameHub, GameStatus, RewardMoment } from "./GameHub";
import {
  emptyProgress,
  localDay,
  questQuestions,
  type Progress,
} from "./progress";
import { Chart } from "./QuestionInput";
import { SpeechReview } from "./speech/SpeechReview";
import type { Transcription } from "./speech/scoring";
const navigation = [
  { id: "home", label: "Practice", mobileLabel: "Practice", icon: House },
  { id: "types", label: "Question types", icon: Target },
  { id: "sections", label: "Section practice", icon: ListChecks },
  { id: "mocks", label: "Mock tests", icon: Trophy },
  {
    id: "guide",
    label: "Learn about PTE",
    mobileLabel: "Learn",
    icon: BookOpen,
  },
  {
    id: "history",
    label: "My practice",
    mobileLabel: "History",
    icon: History,
  },
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
function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (isValidElement<{ children?: ReactNode }>(node))
    return nodeText(node.props.children);
  return Children.toArray(node)
    .map((child) => (isValidElement(child) ? nodeText(child) : String(child)))
    .join(" ");
}
function More({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const nodes = Children.toArray(children);
  const actions = nodes.filter(
    (node) => isValidElement(node) && node.type === Button,
  );
  const texts = nodes
    .filter((node) => !(isValidElement(node) && node.type === Button))
    .map(nodeText);
  return (
    <>
      <Button variant="ghost" className="more" onClick={() => setOpen(true)}>
        <Info />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="info-dialog">
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription className="sr-only">
            Practice information
          </DialogDescription>
          <ReadingPages texts={texts} label="information pages" />
          {actions}
        </DialogContent>
      </Dialog>
    </>
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
  const items = mobile ? navigation.filter((n) => n.mobileLabel) : navigation;
  const current =
    mobile && !["guide", "history"].includes(active) ? "home" : active;
  return (
    <nav
      aria-label={mobile ? "Mobile navigation" : "Main navigation"}
      className={mobile ? "mobile-nav" : "desktop-nav"}
    >
      {items.map((n) =>
        mobile ? (
          <a
            key={n.id}
            href={`#${n.id}`}
            aria-current={current === n.id ? "page" : undefined}
            onClick={() => navigate(n.id)}
            className="nav-icon"
          >
            <n.icon className="size-[22px]" aria-hidden="true" />
            <span>{n.mobileLabel}</span>
          </a>
        ) : (
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
            <TooltipContent side="right">
              {n.label}
            </TooltipContent>
          </Tooltip>
        ),
      )}
    </nav>
  );
}
export default function App() {
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const [hubView, setHubView] = useState("play");
  const [progressReady, setProgressReady] = useState(false);
  const [today, setToday] = useState(localDay);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [page, setPage] = useState(location.hash.slice(1) || "home");
  const [guideId, setGuideId] = useState("");
  const [selectedSections, setSelectedSections] = useState<Section[]>(() =>
    sections.map((section) => section.id),
  );
  const [catalogueIndex, setCatalogueIndex] = useState(0);
  const [search, setSearch] = useState("");
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
    let live = true;
    const refresh = () => {
      setToday(localDay());
      void loadProgress()
        .then((value) => {
          if (live) setProgress(value);
        })
        .catch(() => {
          if (live)
            setStorageError(
              "Game progress could not load. Your practice controls are still available.",
            );
        })
        .finally(() => {
          if (live) setProgressReady(true);
        });
    };
    refresh();
    const timer = setInterval(() => setToday(localDay()), 30000);
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);

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
  }, [page, guideId, result, plan]);
  useEffect(
    () => () => stream.current?.getTracks().forEach((t) => t.stop()),
    [],
  );
  function navigate(to: string) {
    setCelebration(null);
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
  function startQuest() {
    const qs = questQuestions(progress, today);
    if (!qs.length) {
      navigate("types");
      return;
    }
    releaseRecordings(result);
    setResult(null);
    setCelebration(null);
    setPlan({
      mode: "type",
      label: "Daily quest",
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
      .then((saved) => {
        setHistory(saved.history);
        setProgress(saved.progress);
        setResult((current) =>
          current?.id === r.id ? { ...current, reward: saved.reward } : current,
        );
        if (saved.reward.xp) setCelebration(r.id);
        toast.success(
          saved.reward.xp
            ? "+" + saved.reward.xp + " XP · Practice saved"
            : "Practice saved",
        );
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
    setCelebration(null);
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
      setProgress(emptyProgress());
      setCelebration(null);
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
              <GameStatus
                progress={progress}
                today={today}
                onClick={() => {
                  setHubView("progress");
                  navigate("home");
                }}
              />
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
            <div key={result?.id || guideId || active} className="page-enter">
              {result ? (
                <Review
                  result={result}
                  celebrate={celebration === result.id}
                  onTranscription={(questionId, value) =>
                    setResult((current) =>
                      current && current.id === result.id
                        ? {
                            ...current,
                            answers: {
                              ...current.answers,
                              [questionId]: {
                                ...current.answers[questionId],
                                transcription: value,
                              },
                            },
                          }
                        : current,
                    )
                  }
                />
              ) : currentGuide ? (
                <GuideScreen
                  guide={currentGuide}
                  onStart={() => begin("type", currentGuide.id)}
                />
              ) : active === "home" ? (
                <div className="home-screen">
                  <GameHub
                    view={hubView}
                    onViewChange={setHubView}
                    progress={progress}
                    today={today}
                    ready={progressReady}
                    onQuest={startQuest}
                    navigate={navigate}
                  />
                  <div className="beginner-entry">
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
                <div className="screen-stack catalogue-screen">
                  <div className="catalogue-toolbar flex flex-wrap items-center gap-3">
                    <div
                      className="flex gap-1 rounded-lg bg-muted p-1"
                      role="group"
                      aria-label="Filter by section"
                    >
                      {sections
                        .map((section) => ({
                          id: section.id,
                          label: section.title,
                          icon: icons[section.id],
                        }))
                        .map((s) => (
                          <Tooltip key={s.id}>
                            <TooltipTrigger
                              render={
                                <Button
                                  size="icon"
                                  className="size-12"
                                  variant={
                                    selectedSections.includes(s.id)
                                      ? "default"
                                      : "ghost"
                                  }
                                  aria-label={`Filter: ${s.label}`}
                                  aria-pressed={selectedSections.includes(s.id)}
                                  onClick={() => {
                                    setSelectedSections((selected) =>
                                      selected.includes(s.id)
                                        ? selected.filter((id) => id !== s.id)
                                        : [...selected, s.id],
                                    );
                                    setCatalogueIndex(0);
                                  }}
                                />
                              }
                            >
                              <s.icon className="size-5" />
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
                        onChange={(e) => {
                          setSearch(e.target.value);
                          setCatalogueIndex(0);
                        }}
                        className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
                      />
                    </label>
                  </div>
                  <Catalogue
                    index={catalogueIndex}
                    onIndex={setCatalogueIndex}
                    selectedSections={selectedSections}
                    search={search}
                    progress={progress}
                    onSelect={setGuideId}
                  />
                  {(search || selectedSections.length !== sections.length) && (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setSearch("");
                        setSelectedSections(
                          sections.map((section) => section.id),
                        );
                        setCatalogueIndex(0);
                      }}
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              ) : active === "sections" ? (
                <SectionSelect
                  progress={progress}
                  onStart={(id) => begin("section", id)}
                />
              ) : active === "mocks" ? (
                <section className="mock-arena max-w-3xl">
                  <div className="mock-heading">
                    <span className="arena-trophy">
                      <Trophy className="size-6" />
                    </span>
                    <div className="flex-1">
                      <p className="game-eyebrow">THE FULL RUN</p>
                      <h2 className="text-lg font-semibold">Mock 01</h2>
                    </div>
                    <Badge variant="secondary">65</Badge>
                    <IconAction
                      label="Prepare for mock"
                      icon={Play}
                      onClick={() => begin("mock", "mock-01")}
                    />
                  </div>
                  <ol className="arena-stages" aria-label="Mock test stages">
                    {sections.map((s, i) => {
                      const Icon = icons[s.id];
                      return (
                        <li key={s.id} data-track={s.id}>
                          <span className="arena-node">
                            <Icon className="size-5" />
                            <small>{i + 1}</small>
                          </span>
                          <strong>{s.title}</strong>
                          <span>{mocks[0].sectionMinutes[s.id]} min</span>
                        </li>
                      );
                    })}
                  </ol>
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
                      Speaking has optional local transcription; open responses
                      use self-review. Exact live-test UI parity is unverified.
                    </p>
                  </More>
                </section>
              ) : active === "guide" ? (
                <LearnScreen onPractice={() => navigate("types")} />
              ) : (
                <HistoryScreen
                  history={history}
                  onOpen={(id) => void openAttempt(id)}
                  onClear={() => setClearConfirm(true)}
                  onPractice={() => navigate("types")}
                />
              )}
            </div>
          </main>
        </div>
        <Nav
          active={active}
          navigate={(to) => {
            if (to === "home") setHubView("play");
            navigate(to);
          }}
          mobile
        />
        <Dialog open={clearConfirm} onOpenChange={setClearConfirm}>
          <DialogContent showCloseButton={false}>
            <DialogTitle>Clear your practice history?</DialogTitle>
            <DialogDescription>
              This removes responses, recordings, transcripts, XP, streaks,
              badges and attempt history from this browser.
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
function Review({
  result: r,
  onTranscription,
  celebrate,
}: {
  celebrate: boolean;
  result: Result;
  onTranscription: (questionId: string, value: Transcription) => void;
}) {
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState("Your response");
  const id = r.questionIds[index],
    q = questions.find((x) => x.id === id)!,
    a = r.answers[id] || {};
  const f = feedback(q, a);
  const tabs = [
    "Your response",
    "Answer key",
    "Feedback",
    "Prompt",
    ...(q.chart ? ["Image"] : []),
    ...(a.recording ? ["Speech"] : []),
  ];
  const texts =
    tab === "Your response"
      ? [showAnswer(q, a)]
      : tab === "Answer key"
        ? [modelAnswer(q) || "Compare your response with the guidance."]
        : tab === "Feedback"
          ? [f.detail, q.explanation, ...guideFor(q).tips]
          : [q.prompt, q.text, q.audioText].filter(
              (text): text is string => !!text,
            );
  return (
    <div className="screen-stack review-screen">
      {r.reward && <RewardMoment reward={r.reward} celebrate={celebrate} />}
      <div className="review-heading">
        <span>{r.label}</span>
        <Badge variant="secondary">
          {r.finished ? "Completed" : "Ended early"}
        </Badge>
        <More label="About feedback">
          <p>
            Answer keys and self-review guidance are provided, without a
            predicted PTE score. Responses and recordings stay on this device.
          </p>
        </More>
      </div>
      <div className="review-question">
        <span className="question-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <h2>{guideFor(q).title}</h2>
        <Badge variant="outline">{f.label}</Badge>
      </div>
      <div
        className="screen-tabs review-tabs"
        role="group"
        aria-label="Review panels"
      >
        {tabs.map((t) => {
          const Icon =
            t === "Your response"
              ? Play
              : t === "Answer key"
                ? Check
                : t === "Feedback"
                  ? Info
                  : t === "Prompt"
                    ? BookOpen
                    : t === "Image"
                      ? ImageIcon
                      : Mic;
          return (
            <Tooltip key={t}>
              <TooltipTrigger
                render={
                  <Button
                    variant={tab === t ? "secondary" : "outline"}
                    aria-label={t}
                    aria-pressed={tab === t}
                    onClick={() => setTab(t)}
                  />
                }
              >
                <Icon />
                <span>{t}</span>
              </TooltipTrigger>
              <TooltipContent>{t}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      {tab === "Speech" && a.recording ? (
        <div className="speech-panel">
          <SpeechReview
            key={id}
            question={q}
            answer={a}
            attemptId={r.id}
            questionNumber={index + 1}
            onChange={(value) => onTranscription(id, value)}
          />
        </div>
      ) : tab === "Image" && q.chart ? (
        <div className="review-chart">
          <Chart q={q} responsive />
        </div>
      ) : (
        <>
          {tab === "Your response" && a.recording && (
            <audio
              controls
              src={a.recording}
              aria-label={`Your recording for question ${index + 1}`}
            />
          )}
          <ReadingPages key={id + tab} texts={texts} label="feedback pages" />
        </>
      )}
      {r.questionIds.length > 1 && (
        <Pager
          index={index}
          count={r.questionIds.length}
          label="review questions"
          onChange={(n) => {
            setIndex(n);
            const next = questions.find(
              (question) => question.id === r.questionIds[n],
            )!;
            if (
              (tab === "Speech" && !r.answers[next.id]?.recording) ||
              (tab === "Image" && !next.chart)
            )
              setTab("Your response");
          }}
        />
      )}
    </div>
  );
}
