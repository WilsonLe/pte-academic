# Local verification — 15 October 2026

Scope: new static PWA setup in the isolated `codex/pwa-practice` worktree. No merge, deployment, hosted CI, certified scoring or exact live-test visual parity is claimed.

| Boundary | Evidence |
| --- | --- |
| Content | Validator passes 22 guides, 65 original questions, one complete mock, local audio integrity and script hashes |
| Feedback | Five focused content tests pass: answer penalties, adjacent pairs, blanks/dictation and writing guidance |
| Authoring budget | Three Node checks pass: character costs, unknown pricing rejection and cumulative $10 boundary |
| Build | TypeScript 7 and Vite 8 production build passes; static output contains manifest/icons/local fonts/36 MP3 prompts/versioned worker |
| Browser | 14 focused Chrome scenarios pass across scoped runs; covers compact desktop/mobile icon navigation, tooltips, animated guidance, Sonner installation feedback, reduced motion, selected answers, gaps, word bank/reordering, writing timer, single-play audio, microphone/recording persistence, section/mock transitions, offline, multi-answer deductions, dictation and permission failure |
| Subdirectory | /pte-academic/ build and offline browser journey pass, including cached HTTP 206 media byte range |
| Dependencies | npm audit reports zero known vulnerabilities after keeping the shadcn scaffolding CLI out of the application dependency tree |
| Provider | Live OpenRouter speech generation produced all 36 MP3s. Key readback: US$10 total limit, US$0.175072 used, US$9.824928 remaining. Owner-only gitignored credentials/ledger; no credential data in build |
| Privacy | GitHub readback confirms repository visibility PRIVATE |

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
