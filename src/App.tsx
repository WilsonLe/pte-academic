import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  historyQuery,
  progressQuery,
  saveAttemptMutation,
  clearHistoryMutation,
} from "./queries";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { screenPath, useScreen, isScreenId, type ScreenId } from "./routing";
import { AudioPlayer } from "./components/AudioPlayer";
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
  Target,
  Trophy,
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
import { type PracticePlan, type Result } from "./Runner";
import { PracticeSession } from "./PracticeSession";
import { loadAttempt } from "./storage";
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
import { emptyProgress, localDay, questQuestions } from "./progress";
import { Chart } from "./QuestionInput";
import { RequiredSpeechModel } from "./speech/RequiredSpeechModel";
import { SpeechReview } from "./speech/SpeechReview";
import type { Pronunciation } from "./speech/comparison-schema";
const navigation: readonly {
  id: ScreenId;
  label: string;
  mobileLabel?: string;
  icon: typeof House;
}[] = [
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
] as const;
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
function Nav({ active, mobile = false }: { active: string; mobile?: boolean }) {
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
          <Link
            key={n.id}
            to={screenPath(n.id)}
            aria-current={current === n.id ? "page" : undefined}
            className="nav-icon"
          >
            <n.icon className="size-[22px]" aria-hidden="true" />
            <span>{n.mobileLabel}</span>
          </Link>
        ) : (
          <Tooltip key={n.id}>
            <TooltipTrigger
              render={
                <Link
                  to={screenPath(n.id)}
                  aria-label={n.label}
                  aria-current={active === n.id ? "page" : undefined}
                  className="nav-icon"
                />
              }
            >
              <n.icon className="size-[19px]" />
            </TooltipTrigger>
            <TooltipContent side="right">{n.label}</TooltipContent>
          </Tooltip>
        ),
      )}
    </nav>
  );
}
export default function App() {
  const client = useQueryClient();
  const progressState = useQuery(progressQuery());
  const progress = progressState.data ?? emptyProgress();
  const historyState = useQuery(historyQuery());
  const history = historyState.data ?? [];
  const save = useMutation(saveAttemptMutation(client));
  const clear = useMutation(clearHistoryMutation(client));
  const route = useScreen();
  const location = useLocation();
  const go = useNavigate();
  const page = route.page;
  const guideId = route.guideId || "";
  const hubView = route.view || "play";
  const setHubView = (view: string) =>
    go({
      to:
        view === "play"
          ? "/"
          : view === "progress"
            ? "/progress"
            : "/achievements",
    });
  const progressReady = !progressState.isPending;
  const [today, setToday] = useState(localDay);
  const [celebration, setCelebration] = useState<string | null>(null);
  const [selectedSections, setSelectedSections] = useState<Section[]>(() =>
    sections.map((section) => section.id),
  );
  const [catalogueIndex, setCatalogueIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const resultRef = useRef(result);
  resultRef.current = result;
  const [attemptError, setAttemptError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const main = useRef<HTMLElement>(null);
  const pwa = usePwa();
  useEffect(() => {
    const refresh = () => setToday(localDay());
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    const migrateHash = () => {
      const legacy = window.location.hash.slice(1);
      if (isScreenId(legacy))
        void go({ to: screenPath(legacy), replace: true });
    };
    window.addEventListener("hashchange", migrateHash);
    return () => window.removeEventListener("hashchange", migrateHash);
  }, [go]);

  // The URL owns screen identity; async storage reads cannot override later navigation.
  useEffect(() => {
    let live = true;
    setAttemptError("");
    if (!route.attemptId) {
      setResult(null);
      return;
    }
    if (resultRef.current?.id === route.attemptId) return;
    setResult(null);
    void loadAttempt(route.attemptId)
      .then((saved) => {
        if (live) setResult(saved);
        else releaseRecordings(saved);
      })
      .catch(() => {
        if (live)
          setAttemptError(
            "This session is no longer available on this device.",
          );
      });
    return () => {
      live = false;
    };
  }, [route.attemptId]);
  useEffect(() => {
    const current = result;
    return () => releaseRecordings(current);
  }, [result?.id]);
  useEffect(() => {
    main.current?.focus();
    window.scrollTo(0, 0);
    setCelebration(null);
  }, [location.pathname]);
  function navigate(to: ScreenId) {
    void go({ to: screenPath(to) });
  }
  function makePlan(mode?: string, id?: string): PracticePlan | null {
    if (id === "daily" && mode === "type")
      return {
        mode: "type",
        label: "Daily practice",
        questions: questQuestions(progress, today),
        minutes: mocks[0].sectionMinutes,
      };
    if (!["type", "section", "mock"].includes(mode || "")) return null;
    if (mode === "type" && !guides.some((g) => g.id === id)) return null;
    if (mode === "section" && !sections.some((s) => s.id === id)) return null;
    if (mode === "mock" && id !== "mock-01") return null;
    return {
      mode: mode as PracticePlan["mode"],
      label:
        mode === "mock"
          ? mocks[0].title
          : mode === "section"
            ? `${sections.find((s) => s.id === id)!.title} practice`
            : guides.find((g) => g.id === id)!.title,
      questions:
        mode === "mock"
          ? mocks[0].questionIds.map((qid) =>
              questions.find((q) => q.id === qid)!,
            )
          : mode === "section"
            ? questions.filter((q) => guideFor(q).section === id)
            : questions.filter((q) => q.type === id),
      minutes: mocks[0].sectionMinutes,
    };
  }
  function begin(mode: PracticePlan["mode"], id: string) {
    void go({
      to: "/practice/$mode/$practiceId",
      params: { mode, practiceId: id },
    });
  }
  function startQuest() {
    if (!questQuestions(progress, today).length) {
      navigate("types");
      return;
    }
    begin("type", "daily");
  }
  function finish(r: Result) {
    setResult(r);
    void go({ to: "/history/$attemptId", params: { attemptId: r.id } });
    setStorageError("");
    setSaving(true);
    void save
      .mutateAsync(r)
      .then((saved) => {
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
      .finally(() => {
        setSaving(false);
        save.reset();
      });
  }
  async function removeHistory() {
    try {
      await clear.mutateAsync();
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
  const practicePlan =
    page === "practice" && progressReady
      ? makePlan(route.mode, route.practiceId)
      : null;
  if (practicePlan?.questions.length)
    return (
      <PracticeSession
        key={route.mode + "/" + route.practiceId}
        plan={practicePlan}
        onComplete={finish}
      />
    );
  return (
    <TooltipProvider delay={150}>
      <div className="app-shell">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <aside className="sidebar" aria-label="Sidebar">
          <Link to="/" className="rail-logo" aria-label="PTE Studio home">
            <img src={asset("icon.svg")} alt="" className="size-9 rounded-xl" />
          </Link>
          <Nav active={active} />
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="flex min-w-0 items-center gap-3">
              <Link to="/" aria-label="PTE Studio home" className="md:hidden">
                <img
                  src={asset("icon.svg")}
                  alt=""
                  className="size-8 rounded-lg"
                />
              </Link>
              {(result || currentGuide) && (
                <IconAction
                  label={result ? "My practice" : "All question types"}
                  icon={ArrowLeft}
                  onClick={() =>
                    result ? navigate("history") : navigate("types")
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
                }}
              />
              <RequiredSpeechModel />
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
            </div>
          </header>
          {(storageError || pwa.error || progressState.isError) && (
            <div
              className="border-b bg-destructive/5 px-5 py-3 text-xs text-destructive"
              role="alert"
            >
              {storageError ||
                pwa.error ||
                "Practice progress could not load. Your practice controls are still available."}
            </div>
          )}
          <main
            ref={main}
            id="main-content"
            tabIndex={-1}
            className="main-content"
          >
            <div key={result?.id || guideId || active} className="page-enter">
              {route.attemptId && result?.id !== route.attemptId ? (
                <div className="empty-state" role="status">
                  <p>{attemptError || "Opening session…"}</p>
                  {attemptError && (
                    <Button onClick={() => navigate("history")}>
                      Back to history
                    </Button>
                  )}
                </div>
              ) : page === "missing" ||
                (guideId && !currentGuide) ||
                page === "practice" ? (
                <div className="empty-state">
                  <p>
                    {page === "practice" && !progressReady
                      ? "Loading practice…"
                      : "This page is unavailable."}
                  </p>
                  <Button onClick={() => navigate("home")}>
                    Back to practice
                  </Button>
                </div>
              ) : result && result.id === route.attemptId ? (
                <Review
                  result={result}
                  celebrate={celebration === result.id}
                  onPronunciation={(questionId, value) =>
                    setResult((current) =>
                      current && current.id === result.id
                        ? {
                            ...current,
                            answers: {
                              ...current.answers,
                              [questionId]: {
                                ...current.answers[questionId],
                                pronunciation: value,
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
                    onSelect={(id) =>
                      void go({
                        to: "/types/$guideId",
                        params: { guideId: id },
                      })
                    }
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
                  sectionId={route.sectionId}
                  onSelect={(id) =>
                    void go({
                      to: "/sections/$sectionId",
                      params: { sectionId: id },
                    })
                  }
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
                      <p className="game-eyebrow">FULL MOCK TEST</p>
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
                      Read Aloud and Repeat Sentence have local syllable
                      comparison; open responses use self-review. Exact
                      live-test UI parity is unverified.
                    </p>
                  </More>
                </section>
              ) : active === "guide" ? (
                <LearnScreen
                  key={route.topicId}
                  topic={route.topicId}
                  onTopic={(id) =>
                    void (id
                      ? go({ to: "/guide/$topicId", params: { topicId: id } })
                      : go({ to: "/guide" }))
                  }
                  onPractice={() => navigate("types")}
                />
              ) : (
                <HistoryScreen
                  history={history}
                  onClear={() => setClearConfirm(true)}
                  onPractice={() => navigate("types")}
                />
              )}
            </div>
          </main>
        </div>
        <Nav active={active} mobile />
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
  onPronunciation,
  celebrate,
}: {
  celebrate: boolean;
  result: Result;
  onPronunciation: (questionId: string, value: Pronunciation) => void;
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
            onPronunciation={(value) => onPronunciation(id, value)}
          />
        </div>
      ) : tab === "Image" && q.chart ? (
        <div className="review-chart">
          <Chart q={q} responsive />
        </div>
      ) : (
        <>
          {tab === "Your response" && a.recording && (
            <AudioPlayer
              src={a.recording}
              label={`Your recording for question ${index + 1}`}
            />
          )}
          {!(
            tab === "Your response" &&
            a.recording &&
            !a.text &&
            !a.values?.length
          ) && (
            <ReadingPages key={id + tab} texts={texts} label="feedback pages" />
          )}
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
