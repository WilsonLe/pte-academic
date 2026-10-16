# TanStack adoption

Assessed 16 October 2026 against the [public library catalogue](https://tanstack.com/libraries) and [Start 1.0 stable announcement](https://tanstack.com/blog/tanstack-start-1-0). “1.0” identifies Start's stable release; the other libraries have independent versions. `package-lock.json` pins the installed candidates.

## Decisions across the app

| Library               | Decision                  | Current consumer and reason                                                                                                                                                                                                                           |
| --------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start                 | Adopt                     | Static SPA shell, build integration, client entry and document metadata. No runtime server or server functions.                                                                                                                                       |
| Router                | Adopt                     | All practice, learning, history, progress and collection destinations, typed links/parameters and browser navigation. Replaces React Router.                                                                                                          |
| Query                 | Adopt                     | Async local progress and history reads, save/clear mutations and committed-cache synchronization. It reads IndexedDB/localStorage without any HTTP API.                                                                                               |
| Form                  | Adopt                     | Runner's typed answer collection for writing, choices, gaps, ordering, highlights and recordings. No validation blocks blank/partial answers.                                                                                                         |
| Store                 | Use through Form          | Form's reactive Store subscription supplies answer values. No additional global store or duplicate persistence source. Small disclosure, selection and playback states stay local to their components.                                                |
| Router/Query Devtools | Development only          | Lazy tools inside the document and router/query providers. Both modules disappear from production builds.                                                                                                                                             |
| DB                    | Defer                     | Collections/live queries do not solve an unmet need for 10 retained attempts and 65 bundled questions. Preserve the existing atomic IndexedDB queue, Blob storage, v1 upgrade and v2 opener. Revisit for substantially larger relational collections. |
| Table                 | Defer                     | Catalogues, practice modes, achievements and history are measured card pages. There is no data table, column model or sorting/grouping requirement.                                                                                                   |
| Virtual               | Defer                     | The existing bounded `CardsList` and measured reading pages intentionally avoid long scrolling lists. Retain the accessibility scrolling escape.                                                                                                      |
| Pacer                 | Defer                     | Searching 22 guides is cheap. Queuing learner writes, wall-clock deadlines, recording completion and cancellation already have distinct tested owners; debouncing/throttling them would change behavior.                                              |
| Hotkeys               | Defer                     | Existing native controls support keyboard use. No global shortcut requirement; adding shortcuts could intercept answer editing.                                                                                                                       |
| Charts                | Defer                     | `QuestionInput.Chart` renders original question data with an accessible description. A dashboard/charting framework would add weight without a required interaction.                                                                                  |
| Markdown              | Defer                     | Learning content is validated JSON rendered by React. There is no Markdown ingestion or runtime rendering requirement.                                                                                                                                |
| Highlight             | Defer                     | No code examples or syntax-highlighted editor in this learner app.                                                                                                                                                                                    |
| AI                    | Exclude from runtime      | Whisper recognition has been removed; accepted v3 syllable grading keeps its required automatic download, pinned verified cache and cancellable worker. It needs no cloud AI or paid runtime calls.                                           |
| Config                | Defer                     | Tooling for maintaining/publishing JavaScript libraries adds no current capability to this private application. Keep its existing TypeScript/Vite/Tailwind configuration.                                                                             |
| CLI                   | No application dependency | Migration integrates the existing project directly. A starter generator is unnecessary and must not overwrite the app.                                                                                                                                |
| Intent                | Defer installation        | Current official docs and installed package guidance inform this migration. No repository-wide agent configuration or additional skill synchronization process is needed for the runtime change.                                                      |
| Unified Devtools      | Defer                     | The established Router/Query tools cover the adopted runtime features. No additional alpha container or custom panel requirement.                                                                                                                     |

These are inclusion decisions for the current application, not a claim that deferred libraries lack local-first or other useful capabilities. Adoption should follow a concrete consumer rather than package availability.

## Ownership and compatibility

`src/routes/` defines file routes and public screen metadata. `src/routeTree.gen.ts` is generated by the Start plugin; do not edit or format it manually. `src/routing.ts` owns shared screen identity and top-level navigation destinations. The persistent `_workspace` layout retains catalogue filters and pending saves across navigation. It has `ssr: false`; the root also gates its outlet with `ClientOnly`, so the public document hydrates before any browser-only screen mounts. This avoids a nested-Suspense shell mismatch on initial/deep-link/offline loads. Only `RootDocument` renders while building the SPA shell. Paths, IDs, legacy hashes, reload recovery and back/forward behavior remain compatible, including `/pte-academic/`.

`src/queries.ts` creates one local Query client per application and centralizes key/options/mutation ownership. Both query and mutation network modes are `always`: disconnected devices still execute local storage operations. Automatic retries are disabled. There is no Query persister, server hydration of learner state or network endpoint. A successful save/clear cancels older reads before publishing the committed index and profile snapshots. Errors preserve immediate review and existing storage error feedback. Completed save mutation state is reset; inactive mutation entries have zero retention.

`src/storage.ts` remains the only persistence authority. All schema validation, queued writes, retention, transcription anti-resurrection and atomic effort rewards remain there. Query caches the compact history index and progress profile. Loaded review answers/recording URLs stay in the existing route-owned lifecycle, with cleanup on navigation; they are not cached as queries. V3 comparison download/progress/cancellation stay in their existing worker/client owners, not in automatically retryable queries. Legacy transcripts remain readable without a recognition runtime. `src/client.tsx` starts required comparison preparation even on direct practice/run links; `RequiredSpeechModel` retains preparation/error feedback in the header notification bell and popover. Both build scripts keep `validate:comparison`.

`Runner` uses TanStack Form's values and Store subscription for the answer collection. Its immediate answer ref still captures the latest input for wall-clock expiry and recorder completion, including a recorder stopping during forward progression. Runner retains microphone/audio/timing/skip/end authority. `QuestionInput` retains the existing accessible response controls. No hints, transcripts or answer keys appear during a session; review/transcription never awards XP.

## Static build and local verification

```sh
npm ci
npm run build
node --test tests/static-output.test.mjs
npm run test:local-state
npm run test:progress
npm run test:speech
PTE_TEST_PORT=4278 npx playwright test tests/practice.spec.ts --grep 'real routes restore|practice route reload|TanStack local state'
PTE_TEST_SUBPATH=1 PTE_TEST_SUBPATH_PORT=4280 npx playwright test tests/subpath.spec.ts
PTE_STATIC_DIR=dist-subpath node --test tests/static-output.test.mjs
```

The Start build creates `.start/client` and `.start/server`; the latter is used only for public-shell prerendering. `scripts/publish-static.mjs` copies client files into `dist/` (or `dist-subpath/`) and `build-sw.mjs` adds the versioned, scope-isolated worker and identical `404.html`. Upload only the final static directory. `npm run preview` uses `vite.static.config.ts`, so browser verification exercises static assets without Start SSR or server rewrites. Browser checks own their servers and accept isolated port overrides; they do not attach to an existing preview.

All client chunks, including the lazy workspace, enter the ordinary offline pack. Speech worker/WASM assets remain on demand. Whisper transcription has been removed. The accepted v3 comparison pack downloads automatically into its own hash-verified cache and stays out of the ordinary offline pack; previously saved transcripts remain readable. Updates still require explicit activation outside an attempt. Manifest/icon/style/script URLs use the deployment base, including initial Pages 404 entries.

React/React DOM/scheduler share a reusable framework chunk; the workspace remains separately loaded. The comparison worker imports the WASM-only ONNX entry, and Vite selects ONNX's `onnxruntime-web-use-extern-wasm` export condition. Its explicit pinned `wasmPaths` allow embedded fallback factories and unused WASM variants to be omitted. Keep those paths and the standalone worker/cache ownership together when updating the runtime. Worker code is not split into additional imports; the existing runtime file list and on-demand caching remain complete.

Both production build commands inspect the published artifact and fail if any JavaScript file reaches 500,000 bytes. Vite's default warning threshold is unchanged. On the initial optimization candidate against `a0e2809`, the main entry was 329.52 kB plus 218.92 kB React and a 0.59 kB bundler runtime; the workspace was 364.21 kB. Their combined JavaScript was approximately unchanged. Comparison and transcription workers fell from 511.71/547.22 kB to 152.77/495.88 kB, while unused asyncify/JSEP WASM output (55.21 MB) disappeared. Main subsequently removed transcription entirely in [PR #31](https://github.com/WilsonLe/pte-academic/pull/31); [PR #34](https://github.com/WilsonLe/pte-academic/pull/34) preserves that removal and records final combined-build sizes and full merge verification. These are artifact-size measurements, not a measured startup-time claim. The pinned 654 MB comparison model pack is unchanged. The initial draft evidence below remains separate from merge-stage full-suite and deployment verification.

Rollback by reverting the migration; retain IndexedDB v2 and the existing keys/schemas. No learner-data migration, credential change or provider call is needed.

## Initial draft verification, 16 October 2026

- Clean `npm ci`: 230 packages installed, zero reported vulnerabilities.
- Root and subpath Start builds: content validation, TypeScript, public-shell prerendering and static packaging passed. Static-output checks passed for both directories, including developer-tool exclusion and lazy-workspace/offline asset coverage.
- Local Query contracts: 3 passed (offline read/save/clear, duplicate rewards, late-read cancellation and failed-save cache preservation).
- Existing progress and speech/storage contracts: 6 + 5 passed, including legacy records, atomic/idempotent XP, recordings, transcript persistence and anti-resurrection.
- Focused production Chrome journeys: 18 passed. Selection covered real routes, run reload/back, filters, responsive catalogue/all 22 guides, single/multiple choices, dropdowns, word bank/order, writing/deadlines, listening/highlights/dictation, synthetic microphone/recording, section/mock progression, offline media, update deferral, daily rewards and fully offline save/review/clear. The offline journey asserts zero external requests and zero page errors.
- Subpath Chrome journeys: 2 passed, including offline navigation, byte-range audio and a genuine static-host 404 history entry followed by offline reload. Both assert zero page errors.
- Development smoke: home, missing-history, run and legacy-hash entries rendered without page errors; Router and Query developer tools loaded.
- `git diff --check`: passed. The full browser suite and fresh real-model inference were deferred at this initial draft stage; subsequent merge-stage evidence is recorded on PR #24.

## Merge-stage integration and verification

[PR #24](https://github.com/WilsonLe/pte-academic/pull/24) integrates the accepted v3 comparison release from `main` (`7ee4085`) before merging. Required comparison preparation moves from the removed `main.tsx` into the Start client entry, preserving direct practice/run startup. The comparison header notification/popover, local grading callbacks, storage schema/queue, paid-authoring history and model hashes remain intact. Both build paths retain `validate:comparison`. Static-artifact checks explicitly exclude comparison workers/runtime and the large model pack from the ordinary precache.

The merge verification matrix includes all TypeScript/Node contracts, Python training contracts, the complete practice browser suite, static-host subpath checks, and real comparison browser suites at both root and `/pte-academic/`. Root/subpath comparison runs use distinct trace and parity-report paths. The added direct-practice regression checks required model startup before the workspace is displayed. Existing retained PCM/Python controls are reused; no paid generation, fitting or new evaluation selection is needed.

The PR records exact candidate/base review, commands/results, hosted checks and deployment verification. Post-merge checks use an isolated browser and synthetic local attempts; learner data stays on device. Numerical parity and automated browser checks do not establish human pronunciation validity or support across every physical device.

The final base also includes the separately reviewed notification change from [PR #28](https://github.com/WilsonLe/pte-academic/pull/28) (`b230cdb`). Its header bell/popover replaces the former preparation banner. Merge resolution retains that component and both its notification regression and the offline Query regression. No extra automatic review pass is started; the PR records the reviewed revisions, integration validation and final release SHA separately.
