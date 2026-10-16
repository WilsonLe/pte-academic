import { useState } from "react";
import { BookOpen, Image as ImageIcon, ListChecks, Play } from "lucide-react";
import { asset, feedback, guideFor, questions } from "./content";
import { responseBlocks, feedbackBlocks, promptBlocks } from "./review-content";
import { AudioPlayer } from "./components/AudioPlayer";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./components/ui/tooltip";
import { Pager, ReadingPages } from "./Pages";
import { Chart } from "./QuestionInput";
import { SpeechReview } from "./speech/SpeechReview";
import type { Pronunciation } from "./speech/comparison-schema";
import type { Result } from "./Runner";

export function Review({
  result: r,
  onPronunciation,
}: {
  result: Result;
  onPronunciation: (questionId: string, value: Pronunciation) => void;
}) {
  const [index, setIndex] = useState(0);
  const [tab, setTab] = useState(() =>
    guideFor(questions.find((q) => q.id === r.questionIds[0])!).kind === "speak"
      ? "Feedback"
      : "Your response",
  );
  const id = r.questionIds[index];
  const q = questions.find((question) => question.id === id)!;
  const a = r.answers[id] || {};
  const speaking = guideFor(q).kind === "speak";
  const prompt = promptBlocks(q);
  const tabs = [
    "Your response",
    "Feedback",
    ...(prompt.length || q.audio ? ["Prompt"] : []),
    ...(q.chart ? ["Image"] : []),
  ];
  const activeTab = tabs.includes(tab)
    ? tab
    : speaking
      ? "Feedback"
      : "Your response";
  return (
    <div className="screen-stack review-screen" data-question-id={id}>
      <div className="review-question">
        <h2>{guideFor(q).title}</h2>
        {!speaking && <Badge variant="outline">{feedback(q, a).label}</Badge>}
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
              (tab === "Image" && !next.chart) ||
              (tab === "Prompt" && !promptBlocks(next).length && !next.audio)
            )
              setTab(
                guideFor(next).kind === "speak" ? "Feedback" : "Your response",
              );
          }}
        />
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
              : t === "Feedback"
                ? ListChecks
                : t === "Prompt"
                  ? BookOpen
                  : ImageIcon;
          return (
            <Tooltip key={t}>
              <TooltipTrigger
                render={
                  <Button
                    variant={activeTab === t ? "secondary" : "outline"}
                    aria-label={t}
                    className={
                      t === "Feedback" ? "review-feedback-tab" : undefined
                    }
                    aria-pressed={activeTab === t}
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
      {activeTab === "Feedback" && speaking ? (
        <div className="speech-panel">
          <SpeechReview
            key={id}
            question={q}
            answer={a}
            attemptId={r.id}
            onPronunciation={(value) => onPronunciation(id, value)}
          />
        </div>
      ) : activeTab === "Your response" && a.recording ? (
        <AudioPlayer
          key={id}
          src={a.recording}
          label={`Your recording for question ${index + 1}`}
        />
      ) : activeTab === "Image" && q.chart ? (
        <div className="review-chart">
          <Chart q={q} responsive />
        </div>
      ) : (
        <div className="review-reading">
          {activeTab === "Prompt" && q.audio && (
            <AudioPlayer
              key={id}
              src={asset(q.audio)}
              label={`Prompt recording for question ${index + 1}`}
            />
          )}
          <ReadingPages
            key={id + activeTab}
            blocks={
              activeTab === "Your response"
                ? responseBlocks(q, a)
                : activeTab === "Feedback"
                  ? feedbackBlocks(q, a)
                  : prompt
            }
            label="feedback pages"
          />
        </div>
      )}
    </div>
  );
}
