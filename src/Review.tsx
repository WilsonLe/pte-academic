import { useCallback, useState } from "react";
import { asset, guideFor, questions, type Question } from "./content";
import { AudioPlayer } from "./components/AudioPlayer";
import { Pager, ReadingPages, type ReadingFocus } from "./Pages";
import { questionBlocks } from "./review-content";
import { Chart } from "./QuestionInput";
import { Button } from "./components/ui/button";
import { FileText } from "lucide-react";
import { FriendlyFeedback, ReviewDisclosure } from "./FriendlyFeedback";
import { SpeechReview } from "./speech/SpeechReview";
import { answered } from "./progress";
import type { Pronunciation } from "./speech/comparison-schema";
import type { Result } from "./Runner";

function OriginalQuestion({
  question: q,
  focus,
}: {
  question: Question;
  focus?: ReadingFocus;
}) {
  const blocks = questionBlocks(q);
  const extraTranscript = q.text && q.audioText && q.text !== q.audioText;
  return (
    <section className="review-question-panel" aria-label="Original question">
      <div className="response-heading">
        <h3 className={q.prompt ? "question-query" : undefined}>
          {q.prompt || "Question"}
        </h3>
        {extraTranscript && (
          <ReviewDisclosure
            title="Recording transcript"
            blocks={[{ text: q.audioText! }]}
          >
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open recording transcript"
              title="Recording transcript"
            >
              <FileText />
            </Button>
          </ReviewDisclosure>
        )}
      </div>
      {q.chart && (
        <div className="review-chart">
          <Chart q={q} responsive />
        </div>
      )}
      {blocks.length > 0 && (
        <ReadingPages
          key={q.id}
          blocks={blocks}
          label="question pages"
          counterLabel="Question text"
          focus={focus}
        />
      )}
    </section>
  );
}

export function Review({
  result: r,
  onPronunciation,
}: {
  result: Result;
  onPronunciation: (questionId: string, value: Pronunciation) => void;
}) {
  const [index, setIndex] = useState(0);
  const [sourceContext, setSourceContext] = useState<{
    id?: string;
    focus?: ReadingFocus;
  }>();
  const responded = r.questionIds.filter(
    (id) =>
      answered(r.answers[id]) ||
      r.answers[id]?.pronunciation ||
      r.answers[id]?.speechAssessment ||
      r.answers[id]?.transcription,
  );
  const id = responded[Math.min(index, responded.length - 1)];
  const focusSource = useCallback(
    (focus?: ReadingFocus) => {
      // A repeated selection is a fresh reading request, even when the learner
      // manually browsed away from the same source position in the meantime.
      setSourceContext({ id, focus: focus ? { ...focus } : undefined });
    },
    [id],
  );
  if (!id)
    return (
      <p className="empty-state">No responses were saved in this session.</p>
    );
  const q = questions.find((question) => question.id === id)!;
  const a = r.answers[id] || {};
  const speaking = guideFor(q).kind === "speak";
  return (
    <div className="screen-stack review-screen" data-question-id={id}>
      <div className="review-question">
        <h2>{guideFor(q).title}</h2>
        <Pager
          index={index}
          count={responded.length}
          label="review questions"
          counterLabel="Question"
          onChange={setIndex}
        />
      </div>
      <div className="review-workspace">
        <OriginalQuestion
          question={q}
          focus={sourceContext?.id === id ? sourceContext.focus : undefined}
        />
        <section className="review-answer-panel" aria-label="Response feedback">
          {guideFor(q).kind !== "write" && (
            <h3 className="feedback-heading">Feedback</h3>
          )}
          {speaking ? (
            <div className="speech-panel">
              <SpeechReview
                key={id}
                question={q}
                answer={a}
                attemptId={r.id}
                onPronunciation={(value) => onPronunciation(id, value)}
              />
            </div>
          ) : (
            <div className="review-reading">
              {q.audio && guideFor(q).kind !== "write" && (
                <AudioPlayer
                  key={`audio-${id}`}
                  src={asset(q.audio)}
                  label="Prompt recording"
                />
              )}
              <FriendlyFeedback
                key={id}
                question={q}
                answer={a}
                onSourceFocus={focusSource}
                audio={
                  q.audio && guideFor(q).kind === "write" ? (
                    <AudioPlayer
                      src={asset(q.audio)}
                      label="Prompt recording"
                    />
                  ) : undefined
                }
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
