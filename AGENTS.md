# PTE Studio

An independent, beginner-friendly PTE Academic practice PWA. All learner-facing content is original and versioned in Git. There is no backend, CMS, account, runtime AI, analytics, external font request or runtime provider credential.

## Architecture
- React + TypeScript + Vite; use the installed lockfile and `npm ci` (Node 22.12+).
- Tailwind v4 and shadcn's default Nova/Base UI/neutral preset. Preserve generated theme tokens in `src/style.css` and configuration in `components.json`. Learning pages use these defaults; the exam surface has isolated `.exam` styles for test conventions.
- `content/*.json` is the source of truth, imported into the static build. `src/content.ts` owns schemas and feedback logic. Read `content/AGENTS.md` before editing content.
- `src/Runner.tsx` owns forward-only progression, wall-clock deadlines, audio/recording lifecycle and preflight. `QuestionInput.tsx` owns response controls. Never show hints, transcripts or answer keys inside an active test.
- localStorage stores a small attempt index. IndexedDB stores responses and audio Blobs, with 10 retained attempts. Cache Storage stores the static offline pack. No learner data is sent to a provider.
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

## Authority and privacy
The operator authorized OpenRouter audio authoring with a US$10 TOTAL project budget. Exceeding or increasing this limit requires asking the operator. Do not change `content/authoring.json`, reset the local ledger, create another key to evade the cap, or raise the provider key limit without that explicit approval. No automatic retries of paid calls. Reconcile uncertain calls before resuming. Provider-side usage and the conservative local ledger both gate requests.

Credentials belong only in gitignored `.cli/openrouter/token`, directories mode 0700, token/ledger mode 0600. Never display tokens, pass them in command arguments, commit them, or include `.cli/` in a build or artifact. The CLI reads the credential internally and suppresses provider error bodies. Copy project credentials into new same-project worktrees using safe owner-only copies; never read or print their contents.

## Content and product boundaries
- Assume learners know nothing about the test. Explain terms before using abbreviations.
- Provide all three modes: question type, section and full mock.
- Do not refer to or link official Pearson material; this is an explicit operator request. Do not copy official questions, instructions, screenshots or branding. Preserve brief independent-practice and scoring limitations.
- Do not claim exact live-test pixel parity or validated 10–90 scores. The current runner's fidelity limits are listed in `docs/test-fidelity.md`.
- Models and keys are authoring-time only. The deployed site receives static, reviewed media; never add client-side OpenRouter calls.
- Use original black/white line-art branding inspired by the operator's rounded-square app icon references. `public/icon.svg` is the vector master; run `python3 scripts/generate-icons.py` after an icon change.

For repository changes: issue before implementation, isolated feature branch, focused current-candidate checks, linked draft PR, one independent review. No merge or deployment authority is implied.
