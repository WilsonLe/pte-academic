import { useState } from "react";
import { asset, guideFor, questions, type Question } from "./content";
import { AudioPlayer } from "./components/AudioPlayer";
import { Pager, ReadingPages } from "./Pages";
import { questionBlocks } from "./review-content";
import { Chart } from "./QuestionInput";
import { Button } from "./components/ui/button";
import { FileText } from "lucide-react";
import { FriendlyFeedback, ReviewDisclosure } from "./FriendlyFeedback";
import { SpeechReview } from "./speech/SpeechReview";
import { answered } from "./progress";
import type { Pronunciation } from "./speech/comparison-schema";
import type { Result } from "./Runner";

function OriginalQuestion({ question: q }: { question: Question }) {
  const blocks = questionBlocks(q);
  const extraTranscript = q.text && q.audioText && q.text !== q.audioText;
  return (
    <section className="review-question-panel" aria-label="Original question">
      <div className="response-heading">
        <h3>Question</h3>
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
      {q.prompt && <p className="question-query">{q.prompt}</p>}
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
  const responded = r.questionIds.filter(
    (id) =>
      answered(r.answers[id]) ||
      r.answers[id]?.pronunciation ||
      r.answers[id]?.speechAssessment ||
      r.answers[id]?.transcription,
  );
  const id = responded[Math.min(index, responded.length - 1)];
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
        <OriginalQuestion question={q} />
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
              {q.audio && (
                <AudioPlayer
                  key={`audio-${id}`}
                  src={asset(q.audio)}
                  label="Prompt recording"
                />
              )}
              <FriendlyFeedback key={id} question={q} answer={a} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
