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
| AI                    | Exclude from runtime      | Speech recognition is an opt-in local worker with pinned model provenance, cancellation and limits. Keep cloud AI and paid authoring outside the app.                                                                                                 |
| Config                | Defer                     | Tooling for maintaining/publishing JavaScript libraries adds no current capability to this private application. Keep its existing TypeScript/Vite/Tailwind configuration.                                                                             |
| CLI                   | No application dependency | Migration integrates the existing project directly. A starter generator is unnecessary and must not overwrite the app.                                                                                                                                |
| Intent                | Defer installation        | Current official docs and installed package guidance inform this migration. No repository-wide agent configuration or additional skill synchronization process is needed for the runtime change.                                                      |
| Unified Devtools      | Defer                     | The established Router/Query tools cover the adopted runtime features. No additional alpha container or custom panel requirement.                                                                                                                     |

These are inclusion decisions for the current application, not a claim that deferred libraries lack local-first or other useful capabilities. Adoption should follow a concrete consumer rather than package availability.

## Ownership and compatibility

`src/routes/` defines file routes and public screen metadata. `src/routeTree.gen.ts` is generated by the Start plugin; do not edit or format it manually. `src/routing.ts` owns shared screen identity and top-level navigation destinations. The persistent `_workspace` layout retains catalogue filters and pending saves across navigation. It has `ssr: false`; the root also gates its outlet with `ClientOnly`, so the public document hydrates before any browser-only screen mounts. This avoids a nested-Suspense shell mismatch on initial/deep-link/offline loads. Only `RootDocument` renders while building the SPA shell. Paths, IDs, legacy hashes, reload recovery and back/forward behavior remain compatible, including `/pte-academic/`.

`src/queries.ts` creates one local Query client per application and centralizes key/options/mutation ownership. Both query and mutation network modes are `always`: disconnected devices still execute local storage operations. Automatic retries are disabled. There is no Query persister, server hydration of learner state or network endpoint. A successful save/clear cancels older reads before publishing the committed index and profile snapshots. Errors preserve immediate review and existing storage error feedback. Completed save mutation state is reset; inactive mutation entries have zero retention.

`src/storage.ts` remains the only persistence authority. All schema validation, queued writes, retention, transcription anti-resurrection and atomic effort rewards remain there. Query caches the compact history index and progress profile. Loaded review answers/recording URLs stay in the existing route-owned lifecycle, with cleanup on navigation; they are not cached as queries. Speech download/progress/cancellation stays in its worker/client, not in an automatically retryable query.

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

All client chunks, including the lazy workspace, enter the ordinary offline pack. Speech worker/WASM assets remain on demand; public model weights retain their separate opt-in cache. Updates still require explicit activation outside an attempt. Manifest/icon/style/script URLs use the deployment base, including initial Pages 404 entries.

Start's framework entry currently produces Vite's advisory about a JavaScript chunk above 500 kB. It is not a failed build. The workspace is split into its own chunk and speech remains lazy. This migration makes no measured performance improvement claim. Full-suite/real-model inference, merge and deployment evidence remain separate from focused migration checks.

Rollback by reverting the migration; retain IndexedDB v2 and the existing keys/schemas. No learner-data migration, credential change or provider call is needed.

## Focused verification, 16 October 2026

- Clean `npm ci`: 230 packages installed, zero reported vulnerabilities.
- Root and subpath Start builds: content validation, TypeScript, public-shell prerendering and static packaging passed. Static-output checks passed for both directories, including developer-tool exclusion and lazy-workspace/offline asset coverage.
- Local Query contracts: 3 passed (offline read/save/clear, duplicate rewards, late-read cancellation and failed-save cache preservation).
- Existing progress and speech/storage contracts: 6 + 5 passed, including legacy records, atomic/idempotent XP, recordings, transcript persistence and anti-resurrection.
- Focused production Chrome journeys: 18 passed. Selection covered real routes, run reload/back, filters, responsive catalogue/all 22 guides, single/multiple choices, dropdowns, word bank/order, writing/deadlines, listening/highlights/dictation, synthetic microphone/recording, section/mock progression, offline media, update deferral, daily rewards and fully offline save/review/clear. The offline journey asserts zero external requests and zero page errors.
- Subpath Chrome journeys: 2 passed, including offline navigation, byte-range audio and a genuine static-host 404 history entry followed by offline reload. Both assert zero page errors.
- Development smoke: home, missing-history, run and legacy-hash entries rendered without page errors; Router and Query developer tools loaded.
- `git diff --check`: passed. Full browser suite and fresh real-model inference are deferred; no merge or deployment performed.
