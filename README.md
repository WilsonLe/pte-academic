# PTE Studio

A static, installable practice app for someone starting PTE Academic from zero. Learn the format, practise a question type, work through a section, or take a complete 65-question mock.

- Compact desktop header/sidebar and mobile header/footer navigation. Accessible icon controls, animated shadcn guidance panels, tooltips and Sonner feedback, with reduced-motion support.
- 22 question-type guides with instructions, strategies, pitfalls and review guidance.
- 65 original questions, local listening audio, microphone recording, writing and selected-response tasks.
- Timed, forward-only test runner; answers, transcripts and models appear after submission.
- Beginner guide explaining skills, sections, preparation and scores.
- Private on-device history: localStorage index + IndexedDB responses and recordings. Keep 10 recent attempts; clear them from My practice.
- Offline app/media caching, installable manifest and original black-and-white app icons.
- Git-managed content and author/reviewer instructions in [AGENTS.md](AGENTS.md), [content/AGENTS.md](content/AGENTS.md) and [agents/](agents/).

Independent practice simulation. Exact live-test visual parity is unverified, and this app does not produce validated PTE scores. The starter bank is shared across all practice modes; it is one form, not an unlimited unseen question bank. See [test fidelity](docs/test-fidelity.md).

## Develop

Node 22.12+ and npm. Dependency versions are locked in `package-lock.json`.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4178`. The stack uses TanStack Start 1.x in static SPA mode, TanStack Router, Query and Form, React 19.3, TypeScript 7, Vite 8.3, Tailwind 4.3, and shadcn's default Nova preset with Base UI and neutral tokens. Geist is bundled locally. Generated shadcn components and default helper CSS are committed; the scaffolding CLI is run through `npx shadcn@latest` when adding components, rather than shipped as an application dependency. There is no backend or cloud runtime AI. The in-house syllable comparison model runs locally in a browser worker; automatic transcription is no longer included.

The complete [TanStack library assessment](docs/tanstack-adoption.md) records adoption decisions and ownership. Router and Query developer tools load only in development.

## Verify

```sh
npm run validate:content
npm run test:content
node --test tests/openrouter.test.mjs
npm run build
npm run preview
npx playwright test tests/practice.spec.ts
npm run test:subpath
```

Browser tests use installed Google Chrome in an isolated profile and a synthetic microphone. They verify controls, timers, persistence, section transitions, responsive learning pages and offline app/media. They do not certify human speech quality or exact live-test screenshots. Full repository checks remain a merge-stage gate.

## Build and host

`npm run build` writes a completely static `dist/` directory, including a manifest, icons, audio and a content-versioned service worker. Deploy the **contents of `dist/`** to any HTTPS static host. A subdirectory is supported:

```sh
BASE_PATH=/pte-academic/ npm run build
```

Start generates the public SPA shell at build time in `.start/`; `scripts/publish-static.mjs` copies only `.start/client/` to `dist/`. Never upload `.start/server/`. `npm run preview` serves the copied static files without a Start runtime server.

Keep the trailing slash. Browser routing uses real paths such as `/history` and `/history/:sessionID` under the configured base path. Hosts with rewrite support should serve `index.html` for application routes; Vite preview already does this. The build also copies the app shell to [`404.html` for GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-custom-404-page-for-your-github-pages-site), so direct route entry works without server rewrites. Pages still returns HTTP 404 for that initial response, while the app handles the URL. The service worker serves cached route navigation offline. Older top-level hash links convert to real paths. Use HTTPS for microphone and service-worker support; localhost also works for development.

The public app is hosted at **https://wilsonle.github.io/pte-academic/**. [GitHub Pages](.github/workflows/pages.yml) builds and deploys automatically on every push to `main`; it can also be run manually from Actions on `main`. Pull requests run the same production build without deploying. Repository Settings → Pages must use **GitHub Actions** as the publishing source. The workflow uses Node 22, `npm ci`, and `BASE_PATH=/pte-academic/ npm run build`, then uploads only `dist/`. Authoring credentials and learner data are never included. A failed build leaves the existing deployment available.

Open the built site online once to cache the practice pack, then verify a reload without a connection before relying on offline practice. Browser storage may still be evicted. A new pack is offered for explicit reload so an active attempt is not interrupted. Installation uses the browser's Install option or Share → Add to Home Screen on iOS.

## Content and audio management

Edit original JSON and media through Git, following the nested agent instructions. Validation checks schemas, references, unique mock IDs, order and media integrity. It runs before every build.

This Codex session has no native text-to-speech generation tool. The operator selected OpenRouter, used only by the local authoring CLI:

```sh
npm run openrouter -- login
npm run openrouter -- status
npm run openrouter -- plan
npm run openrouter -- tts --confirm-spend --max-usd 0.25
```

The operator authorized an original US$10 budget and then, on 2026-10-16, a fresh US$10 after US$7.0113639 in reservations: **current cumulative cap US$17.0113639**, with all spending history preserved. Passing or increasing it requires asking the operator. The provider key is capped without a reset, and a local cumulative reservation ledger guards each request. A per-run allowance cannot bypass the total. Credentials and ledger stay in gitignored `.cli/openrouter/`, never the site bundle. No automatic paid retries or credit purchases occur. See [audio authoring](agents/audio-author.md) for setup, supported models, macOS audio-inspector prerequisite and review requirements.

Audio is synthetic; group discussions currently use a narrator identifying three speakers. Generation provenance and honest listening-review status live in `content/narration.json`. A successful API response is not evidence of pronunciation quality.

## Local speaking feedback

The accepted blended-English **v3 comparison model** grades syllable sound similarity in Read Aloud and Repeat Sentence. Its required model pack (~624 MiB, plus ~14 MiB speech runtime) downloads automatically when the app opens. Preparation shows progress and retry; **Score speech** waits for readiness and never substitutes word matching for a pronunciation grade. Recordings stay on this device. All four reference accents (American, British, Australian and Indian) are equally valid; uncertain syllables retain no numeric score. The model is experimental synthetic-reference similarity, not correctness, fluency, proficiency or an exam score. Browser scoring supports recordings up to 45 seconds; separate learned stress assessment remains in the Python experiment.

Open a saved speaking response in Review → Speech → **Score speech** to run v3 locally and inspect paged syllable scores/times. The source checkpoint SHA is `2a8e9680e71c85d98f2adc8da725c56f21bd866340cf545916fdf5dff7389d1b`. The browser export keeps its comparison head/reference bank/calibration and uses float16-stored encoder constants with float32 operations. See [browser export and validation](training/checkpoints/blended-english-v3/BROWSER_EXPORT.md), [training process](training/RESUME.md) and the [model card](training/checkpoints/blended-english-v3/MODEL_CARD.md).

Whisper transcription and word-match/pace feedback have been removed. The app uses the in-house v3 comparison model for the two supported fixed-word tasks; it does not generate transcripts. Other speaking tasks retain recording playback and self-review. Previously saved transcripts remain readable with their retained attempts. Old Whisper download caches are inert and can be removed through browser site-storage settings.

Syllable results, transcripts and provenance persist only with retained attempts in IndexedDB; clearing history removes them and recordings, without recreating cleared/pruned attempts or granting XP. The scope-specific model cache survives ordinary app updates/history clearing, supports offline reuse and can be removed through browser site-storage settings. Browser storage can be evicted; missing/corrupt files require download again. Cancel stops local scoring; failure retains playback and never invents a score. Low-memory browsers may be unable to initialize the encoder even after download.

```sh
npm run test:comparison
uv run --project training python training/browser_cases.py
npm run test:comparison:browser
npm run test:speech
```

The four-accent browser validation command requires retained local training reference audio to prepare its development controls; those files are intentionally not in Git. Local v3 inference times out after five minutes.

## Practice progress

The practice home has a rotating three-question reading quest, XP levels, daily streaks, weekly activity and six practice achievements. Any mode counts toward the daily goal. Answering a different question earns 10 XP once per local calendar day; reaching three earns a one-time 30 XP bonus. A level takes 150 XP. Empty attempts earn zero and replaying a review or scoring a recording never earns XP. These are effort milestones, without a proficiency claim.

Quest progress resumes remaining questions. XP, coverage and badges stay in IndexedDB even when older attempts fall outside the ten-attempt history. Game progress starts with newly saved practice after this update; existing attempts, recordings and transcripts are preserved. Clearing history also resets game progress, as the dialog explains. Public model caches remain separate. Daily records retain up to 365 days; cumulative XP, earned badges and longest streak persist.

The IndexedDB upgrade creates a progress store at version 2 without rewriting old attempts. To roll back the game UI, retain the version-2 database opener; browsers cannot downgrade the database to version 1. Refresh other older app tabs after the update. Rewards appear once in the save confirmation toast; XP, streak and badges remain available through the header and collection screens. Review combines each response with its answer key only when they differ, keeps recording playback and speech tools together, and separates question navigation from measured text paging.

Focused game checks: npm run test:progress and the daily-quest/browser journeys in tests/practice.spec.ts.

### Practice interface

Home is one large practice screen, with progress and achievements behind the flame and trophy buttons. Desktop retains its header and icon sidebar; mobile retains its header and the Practice, Learn and History footer tabs, with text below icons. Question types, sections and mock tests remain within Practice. Catalogues use adaptive card pages; saved sessions use compact cards aligned at the top. Single-page pagination is hidden. Question guidance, beginner lessons, long responses and saved transcripts use Next/Previous reading pages sized to the actual font and available space. Review shows one question and one selected response/key/feedback/prompt/speech panel at a time. Returning from a question guide retains the catalogue page and filters.

The ordinary learning workspace fits the device viewport without document scrolling. Windows below 450 CSS pixels high (including extreme zoom) deliberately regain scrolling so enlarged controls remain reachable. The timed test surface keeps its independent exam layout and content scrolling where needed; this redesign changes the practice workspace and post-attempt review.

Screen destinations include `/progress`, `/achievements`, `/types/:guideID`, `/sections/:sectionID`, `/guide/:topicID`, `/mocks`, `/history/:sessionID` and `/practice/:mode/:practiceID`. The active runner adds `/run`; refresh or forward navigation without a live attempt returns to preflight. Routes contain IDs only, never responses or transcripts.

`src/components/AudioPlayer.tsx` owns shared local playback with play/pause, keyboard seeking, time, errors and retry. It uses the existing shadcn Button and shared practice surface/control tokens in `src/screens.css`. Only one review/preflight player plays at a time. The timed runner keeps its one-play lifecycle and uses the shared start button when browser audio needs a gesture. Native controls are not exposed.
