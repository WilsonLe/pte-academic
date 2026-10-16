# Practice UI cleanup coverage

Tracks the operator's request in issue #35 to remove duplicated UI across every practice surface. The original review-only work is included in draft PR #36; this audit records the expanded scope.

## Shared owners

- `ReadingPages`: normalize and deduplicate equal blocks, then measure related text together. Preserve every distinct word and long-content paging; hide single-page controls. Guides, section details, learning articles, information dialogs, review, and speech help/transcripts all consume this owner.
- `GuideScreen`: show Instructions initially; retain Strategy & tips and task-specific scoring guidance, without the generic ready screen or repeated review copy.
- `Preflight`: one plan title/count, required device checks and begin action; keep timing/forward-only consequences and disclosed simulation/storage limitations. No generic ready ornament; no repeated player captions, privacy copy or form count in details. Playback groups and controls retain their accessible names.
- `Runner` / `QuestionInput`: one media status, progress and required countdown. Audio-only status stops occupying the workspace after playback. Preserve source text, task instructions, clocks, input affordances, one-play rules and recoverable media errors; omit chart provenance filler.
- `Review`: same response/comparison, item feedback, source and chart panels for every saved mode. Speaking Feedback owns speech tools and similarity summary; Your response provides playback. The labelled Feedback button stays visible for missing recordings, with saved grades retained when present. General tips remain in Learn; speech help owns its scoring limitations and omits model export internals. Rewards appear once in the save toast.
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

Reading fit checks apply to actual fonts/panels. Existing scrolling fallback for extreme zoom and very short windows remains. Error/retry/device controls and safety consequences are intentionally retained because they enable recovery or prevent losing an attempt. History deletion, shell navigation and model notifications are unchanged.

Build/static-publish and formatting checks accompany the focused journeys. Full-suite execution is reserved for merge authority. Native iOS/Safari, screen-reader behavior and live human speech quality are not established by Chromium fixtures. There are no model, content JSON, storage, reward calculation, provider or dependency changes.
