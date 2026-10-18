# Practice UI cleanup coverage

Tracks the operator's request in issue #35 to remove duplicated UI across every practice surface. The original review-only work is included in draft PR #36; this audit records the expanded scope.

## Shared owners

- `ReadingPages`: normalize and deduplicate equal blocks, then measure related text together. Preserve every distinct word and long-content paging where applicable; Learn opts into complete scrolling text; hide single-page controls. Guides, section details, learning articles, information dialogs, review, and speech help/transcripts all consume this owner.
- `GuideScreen`: show Instructions initially; retain Strategy & tips and task-specific scoring guidance, without the generic ready screen or repeated review copy.
- `Preflight`: one plan title/count, required device checks and begin action; keep timing/forward-only consequences and disclosed simulation/storage limitations. No generic ready ornament; no repeated player captions, privacy copy or form count in details. Playback groups and controls retain their accessible names.
- `Runner` / `QuestionInput`: one media status, progress and required countdown. Audio-only status stops occupying the workspace after playback. Preserve source text, task instructions, clocks, input affordances, one-play rules and recoverable media errors; omit chart provenance filler.
- `Review`: one Feedback surface for every saved mode, with the original question visible beside the response (stacked on narrow screens), complete measured text and inline charts. Source and learner audio remain replayable in one place. Explanations, alternatives and word details open on selection; general tips remain in Learn. Legacy evidence and saved grades remain readable. Rewards appear once in the save toast.
- `GameHub` / mocks: remove the generic ready heading and repeated mock summary figures in details. The header owns progress navigation and the main navigation owns Practice; remove their duplicate local buttons. Keep daily practice, mode navigation, collection access, existing form metadata and simulation caveats. The mock uses one Prepare action beside a named details icon so both fit on a short phone.

## Complete content inventory

All rows are included through their shared owners; no question type is excluded. Guide, setup, active first-question render, and saved-review rendering are checked on phone and desktop. Active rendering uses synthetic microphone input and bounded audio-ended events; separate focused journeys cover native playback, one-play behavior, recording timers and input interaction.

| Question type                | Response kind | Surfaces                              |
| ---------------------------- | ------------- | ------------------------------------- |
| `read-aloud`                 | speak         | Guide, setup, active controls, review |
| `repeat-sentence`            | speak         | Guide, setup, active controls, review |
| `describe-image`             | speak         | Guide, setup, active controls, review |
| `retell-lecture`             | speak         | Guide, setup, active controls, review |
| `answer-short-question`      | speak         | Guide, setup, active controls, review |
| `summarize-group-discussion` | speak         | Guide, setup, active controls, review |
| `respond-to-situation`       | speak         | Guide, setup, active controls, review |
| `summarize-written-text`     | write         | Guide, setup, active controls, review |
| `write-essay`                | write         | Guide, setup, active controls, review |
| `reading-dropdown`           | dropdown      | Guide, setup, active controls, review |
| `reading-multiple`           | multi         | Guide, setup, active controls, review |
| `reorder-paragraphs`         | order         | Guide, setup, active controls, review |
| `reading-blanks`             | bank          | Guide, setup, active controls, review |
| `reading-single`             | single        | Guide, setup, active controls, review |
| `summarize-spoken-text`      | write         | Guide, setup, active controls, review |
| `listening-multiple`         | multi         | Guide, setup, active controls, review |
| `listening-blanks`           | blanks        | Guide, setup, active controls, review |
| `highlight-summary`          | single        | Guide, setup, active controls, review |
| `listening-single`           | single        | Guide, setup, active controls, review |
| `select-missing-word`        | single        | Guide, setup, active controls, review |
| `highlight-incorrect`        | highlight     | Guide, setup, active controls, review |
| `write-dictation`            | dictation     | Guide, setup, active controls, review |

| Mode                | Included surfaces                                                            |
| ------------------- | ---------------------------------------------------------------------------- |
| Daily practice      | Home, setup, active runner, saved review                                     |
| Section `speaking`  | Selection/details, setup, shared runner and review                           |
| Section `reading`   | Selection/details, setup, shared runner and review                           |
| Section `listening` | Selection/details, setup, shared runner and review                           |
| Mock `mock-01`      | Summary/details, setup, all 65 saved review items; shared runner progression |

There is currently one mock form. No new forms or content are introduced. Saved review auditing also visits all 65 original questions, including every chart/source variant, independently of mock ordering.

## Evidence and limits

Focused matrix tests named `all practice cleanup` enumerate content IDs directly, check retained text through every reading page, conditional device checks, no-clipping geometry, every response kind, each review panel and panel fallback. Existing focused journeys verify section/mock progression, writing/choice/gap/order/highlight interactions, microphone denial, actual playback/retry, legacy transcript/syllable review, route/reload and rewards. Mobile captures: [guide](evidence/practice-cleanup-guide-mobile.png), [setup](evidence/practice-cleanup-setup-mobile.png), and [home](evidence/practice-cleanup-home-mobile.png).

Reading fit checks apply to actual fonts/panels. Very short windows and browser zoom overrides retain a contained scrolling escape; the outer document stays fixed and app-controlled zoom is disabled. Error/retry/device controls and safety consequences are intentionally retained because they enable recovery or prevent losing an attempt. History deletion, shell navigation and model notifications are unchanged.

Build/static-publish and formatting checks accompany the focused journeys. Full-suite execution is reserved for merge authority. Native iOS/Safari, screen-reader behavior and live human speech quality are not established by Chromium fixtures. There are no model, content JSON, storage, reward calculation, provider or dependency changes.

## Exhaustive metatext and alignment pass (#136, #137)

The inventory includes Home/daily preparation, the type catalogue, all22guides and setup plans, all three sections, the single65-question mock, all10active response kinds, all22review types, History, Learn, Progress, achievements, header notifications and related details/error states. Meaningful control labels, source context, word/time counts, selected/missed/uncertain states and actionable recovery stay visible. The cleanup targets repeated explanatory prose rather than all muted text.

- Guide Instructions retain task/timing; labelled Skills practised moves to How to review.
- Microphone setup uses Record 3-second sample instead of a separate explanatory sentence. Playback, readiness, permission and retry behavior stay intact.
- Word banks replace the premature default clearing footer with a focus/hover hint at each gap: Select, Place or Clear according to the current action. Filled gaps also show a compact Clear cue when no replacement word is selected, so touch learners do not depend on a tooltip. Stable Blank names and always-available linked action descriptions remain; clearing/replacement and drag are covered for all four variants.
- Achievement details retain earned/locked criteria and remove their generic effort/device footer.
- Speaking and word-practice supporting copy use existing Details or one inline disclosure. See the review audit for retained limitations and provenance.
- A shared responsive workspace gutter aligns the sticky header with main content across routes and desktop/phone breakpoints. Shared review headers align source and response/Feedback columns; an actual query replaces duplicate source-header rows. Spoken-summary replay sits beneath its response heading.

The full-mock visual audit walks all65unique authored IDs using normal forward progression and captures1440×900,390×720,320×568 layouts. It asserts complete inventory, document containment, reachable footer controls and equal choice-row edges. Audio-ended events, accelerated preparation and a synthetic microphone bound this layout test; native playback/timing/inference have separate journeys. Captures flush animation frames after viewport changes to avoid stale compositor tiles. Guide/setup audits enumerate every type, section, mock and daily path, read retained guide text, verify required devices and capture their initial/disclosed layouts. Review independently checks all390question/state/viewport combinations.

Native checks use the existing retained sessions without resets: all22review types, all four word-bank variants with a deliberate wrong/partial response, actual microphone sample/playback, guide disclosure, earned/locked badges and main navigation, with History/reopen/reload and preserved progress. Phone and short-window controls remain contained; very short pages may scroll inside their panel. Exact merge/Pages verification belongs to the linked delivery evidence. Chromium coverage does not establish native Safari, a real screen reader, every OS font override or speech-recognition quality. No new content, model, storage, dependency or provider behavior is introduced.

The current architecture already assigns these owners and requires compact defaults/progressive disclosure. This change needs no new ADR or agent-policy layer; the existing audits are the durable coverage record.

## Guide timing follow-up (#139)

Seven guides already state preparation or response limits in their authored instructions. Optional source-owned `timingInInstructions` phase annotations suppress only the equivalent generated fragment. Three writing guides and the discussion guide retain complete limits in prose; Describe Image, Retell Lecture and Respond to a Situation omit repeated preparation but retain their missing 40s response limit. The other 15 guides keep their necessary fallback timing/shared-section context. Original instructions and numeric Runner/preflight limits are unchanged; no natural-language timing heuristic is used.

The authored-time contract independently binds each annotation to its prose and numeric allowance. The all 22 guide browser matrix checks exact complete Instructions, other tabs, paging and responsive controls. This small static display annotation adds no provider, question, audio, storage, scoring, reward or dependency change; no new ADR is needed.

## Keyboard-only mock follow-up (#141)

The native full-mock journey visited all 65 unique questions and all 22 types using Tab, Shift+Tab, arrows, Space, Enter and typing, with real preparation/audio timing. Six fully blank skips left 59 saved response panels; feedback explanations, the complete three-paragraph essay, source playback and History reopening were exercised by keyboard; a separate supported browser reload verified retention outside the attempt. Recordings establish control lifecycle, not human speech quality. No learner reset or fixture injection was used in that journey.

Reorder Paragraphs now restores focus after a keyboard transfer commits: the first remaining Source paragraph, or the newly placed Target paragraph's return control when Source is empty. Returning a paragraph focuses its restored Source control. Up/down stays with the moved paragraph and uses the opposite enabled direction at an edge. Pointer and drag operations keep their existing behavior. The existing QuestionInput owner applies this to type, section and mock practice; Runner still owns question-entry focus. Focus requests do not survive disabling or unmounting.

The regression uses actual keyboard traversal on both authored variants at desktop and short-phone sizes, checks visible focus and exact Target order through insertion/return/movement edges, then reads the ordinarily saved answer and reloads review. A separate pointer/drag check and the all-question mock layout audit cover neighboring paths. The previous keyboard-labelled pointer test is renamed to describe its actual coverage. No new UI copy, layout, answer rules, storage, content/model, dependency or ADR is introduced.

[Native candidate focus after a keyboard transfer](evidence/reorder-keyboard-focus.jpg) shows the next Source paragraph focused. The capture contains original authored task text only; larger baseline/full-run evidence stays in ignored artifacts.
