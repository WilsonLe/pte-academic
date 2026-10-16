# PTE Studio

An independent, beginner-friendly PTE Academic practice PWA. All learner-facing content is original and versioned in Git. There is no backend, CMS, account, cloud runtime AI, analytics, external font request or runtime provider credential.

## Architecture

- Keep the learning workspace minimal: desktop icon sidebar and header, mobile header and a three-tab footer with text below icons: Practice, Learn, History. Keep question types, sections and mocks within Practice, and utilities in the header. Use accessible names and tooltips for icons; keep beginner guidance in animated collapsibles/accordions, success feedback in Sonner, and honor reduced motion. The operator subsequently requested a more playful, gamified design: allow purposeful violet/lime game cards, XP, streaks, badges and finite celebration motion. The operator then requested larger game UI without a scrolling dashboard: use a viewport-sized play screen, large controls, button-selected progress/collection screens and paged catalogues, guidance, history and review. Measure reading pages against the actual font/panel; never clip text to force a fit. Preserve a scrolling accessibility escape for extreme zoom or very short windows. Keep the timed runner focused and avoid marketing heroes or repeated explanatory copy.
- Use practice/session language in learner-facing copy despite the playful visuals; retain the requested “Start daily quest” action. History uses compact cards, and single-page pagers are hidden. Do not restore the removed header install/offline/info controls, beginner footer or sidebar privacy icon.
- `src/routing.ts` owns screen routes through React Router; preserve basename-aware real paths, history deep links, back/forward and reload recovery. `src/PracticeSession.tsx` owns route-scoped preflight/run lifecycle. Shared playback lives in `src/components/AudioPlayer.tsx` using existing shadcn controls and practice tokens; timed prompts retain Runner authority and one-play rules.
- `src/components/CardsList.tsx` owns responsive card grids and conditional pagination for catalogues, history, practice modes and achievements. Use its sizing options instead of independent column/row breakpoints; keep text readable and empty/single-page lists free of pagination.
- React + TypeScript + Vite; use the installed lockfile and `npm ci` (Node 22.12+).
- Tailwind v4 and shadcn's default Nova/Base UI/neutral preset. Preserve generated theme tokens in `src/style.css` and configuration in `components.json`. Learning pages use these defaults; the exam surface has isolated `.exam` styles for test conventions.
- `content/*.json` is the source of truth, imported into the static build. `src/content.ts` owns schemas and feedback logic. Read `content/AGENTS.md` before editing content.
- `src/Runner.tsx` owns forward-only progression, wall-clock deadlines, audio/recording lifecycle and preflight. `QuestionInput.tsx` owns response controls. Never show hints, transcripts or answer keys inside an active test.
- Game progress in src/progress.ts rewards saved effort, never proficiency: 10 XP per different answered question per local day, plus 30 at three; levels every 150 XP. src/GameHub.tsx owns the game surfaces. Save profile and attempts atomically through the storage queue; transcription/review cannot award XP. Clearing history resets progress, with an explicit dialog. Retaining 10 attempts must not erase earned XP or badges.\n- localStorage stores a small attempt index. IndexedDB v2 stores responses/audio Blobs and a separate progress profile, with 10 retained attempts. Preserve v1 records on upgrade; an old v1 opener cannot downgrade a v2 database. Cache Storage stores the static offline pack. No learner data is sent to a provider.
- The generated shadcn helper stylesheet is vendored unchanged in `src/vendor/shadcn.css` with its MIT license. Use `npx shadcn@latest` to add components; do not ship its scaffolder and archive-processing dependencies in the app.
- `scripts/build-sw.mjs` precaches only build output, scopes cache cleanup by registration scope and serves local media byte ranges. Do not automatically activate updates during an attempt.

## Commands

- `npm run dev` — local development on 127.0.0.1:4178.
- `npm run validate:content` — content contracts, question references and media hashes.
- `npm run test:content` — focused content/feedback checks.
- `node --test tests/openrouter.test.mjs` — authoring budget checks, no network or charges.
- `npm run build` — validation, TypeScript and static `dist/` including versioned worker.
- `npm run preview` — built app on 127.0.0.1:4178; use this for offline checks.
- `npx playwright test tests/practice.spec.ts` — focused Chromium journeys; isolated browser, synthetic microphone. Requires installed Chrome. Full suite is reserved for a merge request under the development workflow.
- `npm run openrouter -- help` — development-only speech authoring; see `agents/audio-author.md`.
- `npm run test:comparison` — local v3 grading/storage contracts. `npm run test:comparison:browser` — actual browser/Python parity, offline and failure controls; prepare retained-data fixtures with `training/browser_cases.py`.
- `npm run test:speech` — local speech scoring/storage contracts. `npm run test:speech:browser` — focused Chrome inference/offline/failure checks; first use downloads public weights, with no paid calls.

## Authority and privacy

The operator originally authorized a US$10 total project budget. On 2026-10-16, after US$7.0113639 in cumulative reservations, the operator explicitly authorized a fresh US$10 allowance from that point. The current cumulative cap is US$17.0113639, recorded with its authorization in `content/authoring.json`; preserve all historical ledger entries. This is a one-time allowance, not an automatic reset. Exceeding or increasing this limit requires asking the operator. Do not change `content/authoring.json`, reset the local ledger, create another key to evade the cap, or raise the provider key limit without that explicit approval. No automatic retries of paid calls. Reconcile uncertain calls before resuming. Provider-side usage and the conservative local ledger both gate requests.

Credentials belong only in gitignored `.cli/openrouter/token`, directories mode 0700, token/ledger mode 0600. Never display tokens, pass them in command arguments, commit them, or include `.cli/` in a build or artifact. The CLI reads the credential internally and suppresses provider error bodies. Copy project credentials into new same-project worktrees using safe owner-only copies; never read or print their contents.

## Content and product boundaries

- Assume learners know nothing about the test. Explain terms before using abbreviations.
- Provide all three modes: question type, section and full mock.
- Do not refer to or link official Pearson material; this is an explicit operator request. Do not copy official questions, instructions, screenshots or branding. Preserve brief independent-practice and scoring limitations.
- Do not claim exact live-test pixel parity or validated 10–90 scores. The current runner's fidelity limits are listed in `docs/test-fidelity.md`.
- OpenRouter models/keys are authoring-time only; never add client-side provider calls. The operator subsequently authorized local runtime speech recognition. `src/speech/` owns review-only Whisper inference in a worker, opt-in downloads, local Cache Storage and word-match feedback. No recording/transcript leaves the device. Keep the pinned model revision, lazy loading, cancellation/limits and no-pronunciation/no-PTE-score disclosure.
- The operator subsequently authorized using accepted blended-English v3 for local Read Aloud/Repeat Sentence syllable grading and explicitly requires its automatic download (not opt-in). `src/speech/comparison-*` owns its pinned, hash-verified model/runtime cache and worker. Keep all four reference accents equally valid, null uncertain scores, 45-second comparison bound, cancellation and reference-similarity/not-correctness disclosures. Word matching/Whisper remains separate, never a grade fallback. Derived browser model weights are committed; raw training audio/features/credentials remain ignored. No learner recording is uploaded.
- Persist transcripts only through `saveTranscription` and syllable grades through `savePronunciation` in the existing IndexedDB queue. Never put them in the localStorage index or recreate cleared/pruned attempts. Speech worker/WASM assets cache on demand; model cache is separate from the ordinary offline pack.
- Use original black/white line-art branding inspired by the operator's rounded-square app icon references. `public/icon.svg` is the vector master; run `python3 scripts/generate-icons.py` after an icon change.

For repository changes: issue before implementation, isolated feature branch, focused current-candidate checks, linked draft PR, one independent review. No merge or deployment authority is implied.
