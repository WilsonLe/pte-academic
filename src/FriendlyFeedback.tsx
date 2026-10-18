import { useCallback, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { type Answer, type Question, guideFor, wordCount } from "./content";
import { reviewItems, type ReviewItem } from "./review-diff";
import { ReadingPages, type ReadingBlock, type ReadingFocus } from "./Pages";
import { CardsList } from "./components/CardsList";
import { Button } from "./components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog";
import { Chart } from "./QuestionInput";

export function ReviewDisclosure({
  title,
  blocks,
  question,
  children,
}: {
  title: string;
  blocks: ReadingBlock[];
  question?: Question;
  children: React.ReactElement;
}) {
  return (
    <Dialog>
      <DialogTrigger render={children} />
      <DialogContent className="practice-ui info-dialog feedback-dialog">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">
          Saved question feedback
        </DialogDescription>
        {question?.chart && (
          <div className="review-chart">
            <Chart q={question} responsive />
          </div>
        )}
        <ReadingPages
          blocks={blocks}
          label="detail pages"
          counterLabel="Details"
        />
      </DialogContent>
    </Dialog>
  );
}

export function FriendlyFeedback({
  question: q,
  answer: a,
  audio,
  onSourceFocus,
}: {
  question: Question;
  answer: Answer;
  audio?: React.ReactNode;
  onSourceFocus?: (focus?: ReadingFocus) => void;
}) {
  const [selected, setSelected] = useState<ReviewItem>();
  const items = useMemo(() => reviewItems(q, a), [q, a]);
  const visibleItemsChanged = useCallback(
    (visible: readonly ReviewItem[]) => {
      onSourceFocus?.(visible[0]?.source);
    },
    [onSourceFocus],
  );
  const writing = guideFor(q).kind === "write";
  return (
    <div className="friendly-feedback" data-kind={guideFor(q).kind}>
      {writing ? (
        <section className="written-response" aria-label="Written response">
          <div className="response-heading">
            <h3>Response</h3>
            <span className="response-word-count">
              {wordCount(a.text || "")} words
            </span>
            <ReviewDisclosure title="Response details" blocks={items[0].detail}>
              <Button
                variant="ghost"
                size="sm"
                aria-label="Open response details"
              >
                Details <ChevronRight aria-hidden="true" />
              </Button>
            </ReviewDisclosure>
          </div>
          {audio}
          <ReadingPages
            blocks={items[0].parts.map((part) => ({ text: part.text }))}
            label="feedback pages"
            counterLabel="Feedback"
          />
        </section>
      ) : (
        <Dialog
          open={!!selected}
          onOpenChange={(open) => {
            if (!open) setSelected(undefined);
          }}
        >
          <CardsList
            items={items}
            onVisibleItemsChange={visibleItemsChanged}
            label="feedback pages"
            counterLabel="Feedback"
            className="comparison-list"
            maxColumns={1}
            minCardWidth={240}
            minCardHeight={160}
            maxCardHeight={180}
            maxRows={4}
            render={(item) =>
              item.words ? (
                <div className="comparison-card comparison-words" key={item.id}>
                  <span className="comparison-title">{item.title}</span>
                  <div>
                    {item.parts.map((part, i) => (
                      <DialogTrigger
                        key={i}
                        render={
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`comparison-token diff-${part.tone}`}
                          />
                        }
                        onClick={() => {
                          onSourceFocus?.(item.source);
                          setSelected({
                            ...item,
                            title: part.text,
                            detail: [
                              {
                                text:
                                  part.mark === "✓"
                                    ? "This word matches the recorded sentence; case and punctuation are ignored."
                                    : part.tone === "bad"
                                      ? "This typed word is extra or differs from the recorded sentence at this point."
                                      : "This recorded word is missing or different at this point in your response.",
                              },
                              { label: "Recorded sentence", text: q.model! },
                              ...item.detail,
                            ],
                          });
                        }}
                        aria-label={`${item.title}: ${part.text}, ${part.tone === "good" ? "recorded word" : "typed word"}. Explain`}
                      >
                        <span aria-hidden="true">{part.mark}</span> {part.text}
                      </DialogTrigger>
                    ))}
                  </div>
                </div>
              ) : (
                <DialogTrigger
                  key={item.id}
                  render={
                    <Button variant="ghost" className="comparison-card" />
                  }
                  onClick={() => {
                    onSourceFocus?.(item.source);
                    setSelected(item);
                  }}
                  aria-label={`${item.title}: ${item.state}. Explain`}
                >
                  <span className="comparison-title">
                    {item.title}
                    <span
                      className={
                        item.state === "Not automatically graded" ||
                        item.parts.some((part) => part.text === item.state)
                          ? "sr-only"
                          : undefined
                      }
                    >
                      {item.state}
                    </span>
                    <ChevronRight aria-hidden="true" className="size-4" />
                  </span>
                  {item.parts.map((part, i) => (
                    <span
                      className={`comparison-line diff-${part.tone}`}
                      key={i}
                    >
                      <span aria-hidden="true">{part.mark}</span>
                      <span>{part.text}</span>
                    </span>
                  ))}
                </DialogTrigger>
              )
            }
          />
          {selected && (
            <DialogContent className="practice-ui info-dialog feedback-dialog">
              <DialogTitle>{selected.title}</DialogTitle>
              <DialogDescription className="sr-only">
                {selected.state}
              </DialogDescription>
              <ReadingPages
                key={selected.id}
                blocks={selected.detail}
                label="detail pages"
                counterLabel="Details"
              />
            </DialogContent>
          )}
        </Dialog>
      )}
    </div>
  );
}
