# Local verification — 15 October 2026

Scope: new static PWA setup in the isolated `codex/pwa-practice` worktree. No merge, deployment, hosted CI, certified scoring or exact live-test visual parity is claimed.

| Boundary         | Evidence                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content          | Validator passes 22 guides, 65 original questions, one complete mock, local audio integrity and script hashes                                                                                                                                                                                                                                                                                 |
| Feedback         | Five focused content tests pass: answer penalties, adjacent pairs, blanks/dictation and writing guidance                                                                                                                                                                                                                                                                                      |
| Authoring budget | Three Node checks pass: character costs, unknown pricing rejection and cumulative $10 boundary                                                                                                                                                                                                                                                                                                |
| Build            | TypeScript 7 and Vite 8 production build passes; static output contains manifest/icons/local fonts/36 MP3 prompts/versioned worker                                                                                                                                                                                                                                                            |
| Browser          | 14 focused Chrome scenarios pass across scoped runs; covers compact desktop/mobile icon navigation, tooltips, animated guidance, Sonner installation feedback, reduced motion, selected answers, gaps, word bank/reordering, writing timer, single-play audio, microphone/recording persistence, section/mock transitions, offline, multi-answer deductions, dictation and permission failure |
| Subdirectory     | /pte-academic/ build and offline browser journey pass, including cached HTTP 206 media byte range                                                                                                                                                                                                                                                                                             |
| Dependencies     | npm audit reports zero known vulnerabilities after keeping the shadcn scaffolding CLI out of the application dependency tree                                                                                                                                                                                                                                                                  |
| Provider         | Live OpenRouter speech generation produced all 36 MP3s. Key readback: US$10 total limit, US$0.175072 used, US$9.824928 remaining. Owner-only gitignored credentials/ledger; no credential data in build                                                                                                                                                                                       |
| Privacy          | GitHub readback confirms repository visibility PRIVATE                                                                                                                                                                                                                                                                                                                                        |

Browser tests use real Chromium audio/recording/storage APIs with a synthetic microphone. Accelerated clocks verify deadline transitions; they do not represent a human sitting the entire exam. Generated speech has measured durations and provenance, with human listening review still pending. Screenshots verify layout only.

One development run had two selectors matching duplicate task/review labels; those were scoped to the intended reading task/first review item. Concurrent root/subdirectory runs initially shared Playwright artifact output; their output directories are now separate, and affected checks pass. The original offline reload failure was traced to `Vary: Origin` on static assets; cache lookups now ignore that variation for the bundled same-origin pack. Offline reload/media checks pass at both root and subdirectory boundaries.

The build reports an approximately 635 kB uncompressed application chunk. It is cached with the offline pack; no performance benchmark or slow-device claim is made. Full repository checks are deferred until merge is requested.

The one independent review examined initial head `2e9b68dae918ad8f13018e8b1a821516052d5041` against base `95d836269e47754f63daae8b64fa47a446b79a27`. It confirmed one P2: the worker state-change handler read `registration.installing` after the browser had cleared it, hiding newly waiting updates. The fix captures the installing worker, observes already installing/waiting workers, and cleans up listeners. A real two-version local service-worker browser regression verifies an update is offered without reloading, withheld during practice, and activates only after explicit reload following review.

The operator subsequently requested responsive icon navigation and a minimal app interface. Those changes and the review fix pass focused checks; the final head has not received a second independent review. No second automatic cycle was run.

Commands:

```sh
npm run validate:content
npm run test:content
node --test tests/openrouter.test.mjs
npm run build
npx playwright test tests/practice.spec.ts
npx playwright test tests/practice.spec.ts --grep 'beginner navigation|single answer submits|manifest|multiple choices'
npm run test:subpath
npm audit --audit-level=high
```

Visual evidence: [desktop](overview-desktop.png), [mobile](overview-mobile.png), [test screen](exam-reading.png).

## On-device transcription follow-up (issue #3)

Historical evidence: Whisper transcription was subsequently removed in [PR #31](https://github.com/WilsonLe/pte-academic/pull/31). The commands and runtime details in this section describe the earlier implementation; current speech grading uses the in-house v3 comparison model, with legacy transcripts retained for reading.

The operator replaced cloud scoring exploration with browser-local transcription. Transformers.js 4.3.1 runs pinned q8 Whisper Tiny English on single-thread WASM in a dedicated worker. Model requests are restricted to public pinned-revision GET/HEAD retrieval. Worker/runtime files are excluded from eager app precaching and cached after first use; weights use their own scoped Cache Storage. No OpenRouter scoring calls or new charges were made.

- Five focused speech contracts cover word-error alignment/padding/normalization/empty input, task-specific feedback, persisted transcript/recording compatibility and clear/prune late-write races.
- Real Chrome inference uses original local audio and native MediaRecorder output, then decodes/resamples locally. Network instrumentation checks there are no request bodies/uploads and model requests stay pinned. The first actual run (MP3 fixture) recognized the expected sentence and produced 100% word match; this is a transport/runtime fixture, not a human pronunciation benchmark.
- A fresh-document offline second transcription and persisted feedback are verified separately from a warm in-memory model.
- Focused browser branches cover silence without model download, failed download, cancellation/retry, missing Worker support and invalid audio. Playback remains available.
- Root/subdirectory app and speech assets, existing microphone review, saved history, offline media and explicit pack updates are included in affected checks.
- Dependencies audit has zero known vulnerabilities. Main application chunk is approximately 645 kB; the separate speech worker is approximately 547 kB. The on-demand WASM used in Chrome is approximately 14.3 MB; pinned model/tokenizer files bring first-use data to roughly 60 MB. The library also emits an unused alternative WASM asset in static output, excluded from eager caching.

Investigation caught Transformers.js discovery probes using its default main revision even when pipeline revision was specified. The remote URL template is pinned too; the guard remains fail-closed. One test initially treated Hugging Face's same-revision resolve-cache redirects as unpinned; the assertion now validates the revision in both URL forms.

No current-head independent review is claimed. The existing draft PR's one automatic cycle remains bound to the older reviewed head recorded above. Browser compatibility outside tested Chrome, human speech/accent fairness, mobile-device latency and certified proficiency scoring remain unverified.

Focused follow-up commands:

```sh
npm run test:speech
npm run test:speech:browser
PTE_TEST_SUBPATH=1 PTE_TEST_SPEECH=1 npx playwright test tests/speech.spec.ts --grep 'real on-device'
npx playwright test tests/practice.spec.ts --grep 'microphone preflight|manifest|single answer submits|new offline pack'
npm run test:subpath
```

[Local speech review screenshot](local-speech-review.png).

## Playful practice and real progress (issue #4)

The practice workspace now uses violet/lime quest cards, tactile pastel mode cards, section colors, a weekly activity trail, rank/XP meters, six collectible achievements and a staged mock view. Timed exam styling/behavior is preserved. Default shadcn tokens/primitives remain; component-level game accents implement the operator's newer design request.

The daily reading quest rotates original items and starts with varied types. It resumes remaining daily questions; any practice mode counts toward the goal. Saved answers earn 10 XP once per different question/local day, with 30 extra XP on first reaching three. Levels advance every 150 XP. Empty attempts, repeated review and transcription earn no XP. Rewards measure effort, not proficiency.

IndexedDB v2 adds a separate profile and commits it atomically with attempts. Duplicate result IDs cannot re-award, daily IDs prevent repeat question rewards, earned progress survives the ten-attempt retention limit, and clearing history resets it with an explicit warning. Existing v1 responses, recording Blobs and transcripts survive upgrade. Calendar arithmetic is tested across Sydney DST and year/leap-day boundaries; credit uses the completion day, including delayed saves after midnight. Daily records are bounded at 365; cumulative XP, unlocked badges and longest streak persist. Rollback must retain a v2-compatible database opener because IndexedDB cannot downgrade.

Evidence:

- Six focused progress/storage contracts pass: effort and deduplication, daily bonus, calendar streaks, resumed/varied quest, bounded-ledger achievements, level-up, v1 preservation, repeated/concurrent queued saves, pruning/reset and midnight credit.
- Nine affected practice browser journeys pass across scoped runs: navigation/disclosures/mobile, selected-answer persistence/clear, native microphone review, section/full mock transitions, offline app/media, explicit worker updates, complete daily quest/reload/badges/reset, and empty/partial quest/reduced motion.
- Actual on-device MediaRecorder speech inference and fresh-document offline repeat pass after the schema upgrade. Five speech contracts and five content checks pass. Root build/TypeScript and subdirectory offline media/range checks pass.
- A combined browser run had a microphone preflight timeout and a quest test timeout after its final reset. Both original cases passed unchanged in isolation (4.4s and 3.0s); no assertion or timeout was weakened. Root cause was not established.
- Screenshots inspect honest zero state, earned progress and saved reward. Motion is disabled only when taking a stable screenshot; separate assertions exercise animation/reduced-motion behavior.
- No current-head independent review, full-suite run, merge or deployment is claimed. The prior draft PR's one automatic review remains pinned to its older head.

Visual evidence: [new desktop](overview-desktop.png), [mobile viewport](overview-mobile.png), [earned progress](game-progress.png), [quest reward](game-reward.png).

Focused commands:

```sh
npm run test:progress
TZ=Australia/Sydney npm run test:progress
npm run test:speech
npm run test:content
npm run build
npx playwright test tests/practice.spec.ts --grep "beginner navigation|single answer submits|section mode|empty quest"
npx playwright test tests/practice.spec.ts --grep "daily quest earns|full mock"
PTE_TEST_SPEECH=1 npx playwright test tests/speech.spec.ts --grep "real on-device"
npm run test:subpath
```

## Larger game screens (#5)

The operator requested larger controls and a screen-sized game instead of a vertically stacked dashboard. Home now focuses on a large daily quest and three practice controls. Progress/weekly streak and badge collection open using buttons. Six main routes retain desktop header/sidebar and mobile header/footer. Catalogues, history, learning topics, guidance and review are paginated; review selects one question and one content panel. Long responses/transcripts and local speech help/comparison use measured reading pages, with no hidden last line. Catalogue filters/page survive a guide round-trip. The ordinary workspace has no document scrolling; an explicit accessibility fallback allows scrolling below 450 CSS pixels height. The exam runner retains its separate conventions and content scrolling.

Focused candidate verification: production content validation/TypeScript/build; six progress/storage and five speech/storage contracts; affected Chrome navigation, persisted answer, dropdown, section/full-mock, microphone, listening review, multi-choice feedback and daily reward/resume journeys across scoped runs. The screen layout journey checks all six routes at 1440×900, 1024×768, 390×844 and 360×640, progress/collection disclosure and all 22 question types across pages. A long saved transcript fixture checks all review panels and complete transcript pagination at 360×640. Native on-device recognition plus saved/fresh-document offline reuse and subdirectory offline/range media are checked separately. Screenshot evidence is refreshed for the larger interface. No new provider calls or spend.

During development, the first reading-page fit used an estimate that briefly overflowed at a small size; it was replaced with actual text measurement and font-ready/resize repagination. An inventory assertion originally counted distinct titles (20); it now distinguishes each section/type (22). Listening review exposed the written prompt without the separate correct audio transcript; both are now available on prompt pages. These failures were fixed without reducing visibility or coverage. Detailed commands/results are in the PR follow-up.

The original single independent review remains bound to 2e9b68d / 95d8362. Later operator-requested scope is focused-tested, not independently re-reviewed. No full-suite, merge, hosted release or pixel-perfect live-test claim.

## URL routing and simplified practice workspace — 16 October 2026

Tracks #6 and draft PR #14. Removed hero question chips/promotional text, header offline/install/info controls, beginner footer, sidebar privacy tooltip, redundant review summary and single-page pagers. Practice/session wording replaces play/round vocabulary while retaining the requested Start daily quest action. History uses compact linked cards. React Router owns screen destinations, including persisted `/history/:sessionID`, section/topic/progress screens and route-scoped preflight/runner lifecycle. Old top-level hash links migrate on entry and during same-document navigation.

Shared AudioPlayer and AudioStartButton use existing shadcn Button primitives and practice surface/control tokens. Preflight, microphone samples, recorded responses and speech review share playback/seek/time/error/retry controls; unmount stops media. Runner retains single-play authority. Content, storage schema, progress rules, speech model, provider budget and runtime network boundaries are unchanged.

Integrated concurrently merged main changes through `8a865e7`: independent section filters, Practice/Learn/History mobile tabs, GitHub Pages configuration and the shared CardsList component. CardsList remains the single owner of catalogue/history/mode/achievement grids. History uses its compact 112–136px sizing configuration; intrinsic content and the scrolling accessibility escape keep larger text readable. No separate PagedList implementation remains.

Direct nested routes use the configured absolute asset basename. The build generates `404.html` from the app shell for GitHub Pages without server rewrites. That initial static-host response retains HTTP 404 while the client handles the requested URL; controlled offline navigation is served by the worker. A local Pages-style HTTP server verifies direct history entry and later offline reload; no deployment was performed by this task.

Final-source focused evidence:

- `npm run build`: content validation, TypeScript, static output and service-worker generation pass. The existing large-chunk advisory remains; no performance benchmark is claimed.
- Seventeen selected practice browser journeys pass across scoped runs on the integrated source. Coverage includes all card consumers/viewport thresholds, catalogue completeness and filter persistence, mobile tabs, question/section/article/progress routes, saved history and missing-session recovery, runner reload/back/forward safety, one-play listening, native recording/shared speech playback, audio keyboard seek/error/retry/navigation cleanup, daily progress, offline operation and explicit worker updates.
- A ten-session history regression first failed on the independently reviewed candidate. It now traverses all retained sessions at 390×844, 390×900, 900×900 and 1440×900, independently checks card/pager geometry, and verifies non-overlap with longer labels/enlarged type. The regression was refreshed after shared CardsList integration.
- `PTE_TEST_SUBPATH=1 npx playwright test tests/subpath.spec.ts --reporter=line`: both nested offline/range-media and static-404 direct-entry journeys pass.
- `npm run test:speech`: five scoring/storage contracts pass. Fresh speech-model inference is not rerun for this presentation-only change.
- Formatting and diff checks pass. Full-suite coverage is deferred until merge is requested.

The single independent review covered base `82b402f` / head `91b0f14`, and found one P2 compact-history/pager overlap plus stale cloud-icon documentation. Both are addressed. The later fixes and base integrations are focused-validated, not independently re-reviewed; the original review is historical to that pinned candidate. No second automatic review was requested.

Synthetic-browser screenshots: `overview-desktop.png`, `overview-mobile.png`, `routing-history-desktop.png`, `routing-history-populated-mobile.png`, `routing-review-desktop.png`, `routing-review-mobile.png`. Manual in-app preview confirmed an existing saved session's URL/reload and shared playback without changing that saved response. This is local/draft-PR evidence, not a merge or deployment.
