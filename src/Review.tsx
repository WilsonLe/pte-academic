import { useState } from "react";
import { asset, feedback, guideFor, questions } from "./content";
import { responseBlocks, feedbackBlocks, promptBlocks } from "./review-content";
import { AudioPlayer } from "./components/AudioPlayer";
import { Badge } from "./components/ui/badge";
import { Pager, ReadingPages } from "./Pages";
import { Chart } from "./QuestionInput";
import { SpeechReview } from "./speech/SpeechReview";
import { answered } from "./progress";
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
        {!speaking && <Badge variant="outline">{feedback(q, a).label}</Badge>}
        <Pager
          index={index}
          count={responded.length}
          label="review questions"
          counterLabel="Question"
          onChange={setIndex}
        />
      </div>
      <h3 className="feedback-heading">Feedback</h3>
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
          {q.chart && (
            <div className="review-chart">
              <Chart q={q} responsive />
            </div>
          )}
          <ReadingPages
            key={`reading-${id}`}
            blocks={[
              ...responseBlocks(q, a),
              ...feedbackBlocks(q, a),
              ...promptBlocks(q),
            ]}
            label="feedback pages"
            counterLabel="Feedback"
          />
        </div>
      )}
    </div>
  );
}
