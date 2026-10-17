# PTE Studio

A static, installable practice app for someone starting PTE Academic from zero. Learn the format, practise a question type, work through a section, or take a complete 65-question mock.

- Compact desktop header/sidebar and mobile header/footer navigation. Accessible icon controls, animated shadcn guidance panels, tooltips and Sonner feedback, with reduced-motion support.
- 22 question-type guides with instructions, strategies, pitfalls and review guidance.
- 65 original questions, local listening audio, microphone recording, writing and selected-response tasks.
- Timed, forward-only test runner; answers, transcripts and models appear after submission.
- Beginner guide explaining skills, sections, preparation and scores.
- Private on-device history: localStorage index + IndexedDB responses and recordings. Keep 10 recent attempts. History has no clear-history control.
- Offline app/media caching, installable manifest and original black-and-white app icons.
- Git-managed content and author/reviewer instructions in [AGENTS.md](AGENTS.md), [content/AGENTS.md](content/AGENTS.md) and [agents/](agents/).

For a repeatable student walkthrough and improvement report, use the [playtest workflow](agents/playtest.md).
Ask to **“run an autopilot playtest”** for [one cycle](agents/playtest.md#autopilot-playtest-one-cycle) through a new actionable discovery, implementation, review, automatic merge and merged-revision verification. A clean walkthrough triggers [deeper discovery](agents/playtest.md#discovery-gate) and does not count as a completed cycle. Plain “playtest” produces findings.

Independent practice simulation. Exact live-test visual parity is unverified, and this app does not produce validated PTE scores. The starter bank is shared across all practice modes; it is one form, not an unlimited unseen question bank. See [test fidelity](docs/test-fidelity.md).

## Develop

Node 22.12+ and npm. Dependency versions are locked in `package-lock.json`.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:4178`. The stack uses TanStack Start 1.x in static SPA mode, TanStack Router, Query and Form, React 19.3, TypeScript 7, Vite 8.3, Tailwind 4.3, and shadcn's default Nova preset with Base UI and neutral tokens. Geist is bundled locally. Generated shadcn components and default helper CSS are committed; the scaffolding CLI is run through `npx shadcn@latest` when adding components, rather than shipped as an application dependency. There is no backend or cloud runtime AI. Independent word recognition and the in-house syllable comparison model run locally in a browser worker after submission.

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

Open the built site online once to cache the practice pack, then verify a reload without a connection before relying on offline practice. Browser storage may still be evicted. A new pack is offered for explicit reload so an active attempt is not interrupted. If another tab applies the update first, use the same action to reload this tab's app code when ready. Installation uses the browser's Install option or Share → Add to Home Screen on iOS.

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

Speaking review recognises words independently from recorded audio, including open tasks with no reference text. A pinned local wav2vec2 word recognizer supplies estimated words and times; the accepted blended-English **v3 comparison model** then grades each recognised word’s syllable sounds against its trained four-accent synthetic reference bank. Prompt text is used only for a later omissions/substitutions display. Recognition errors can affect which word is assessed; recognition confidence is not pronunciation correctness.

The required packs (~692 MiB lossless download, ~826 MiB decoded, plus ~14 MiB speech runtime) download automatically through header notifications with integrity checks, progress and retry. Recordings stay on this device. All four reference accents (American, British, Australian and Indian) remain equally valid for sound comparison. Unknown or uncertain syllables retain no numeric score. This is experimental synthetic-reference similarity, not correctness, fluency, content relevance, proficiency or an exam score. Audio-only review supports up to 125 seconds with overlapping bounded windows; legacy comparison and isolated syllable retries retain their 45-second bound. Stress assessment remains Python-only.

Saved review has one Feedback surface and includes only responded questions; a single question has no pager. All seven speaking types automatically assess saved recordings once the model is ready. Recognised words colour supported syllable letter groups green (75+), yellow (50–74) or red (below 50); uncertain/unmapped groups stay neutral. Numeric scores remain in word details and accessible descriptions. Authored letter groups visualize syllable grades, not individual-letter model scores. Selecting a word opens the actual learner word segment and a separate synthetic word reference when one is in the bundled library, plus syllable selection and an eight-second local retry. Word references prepare independently, so saved feedback and reference playback remain available while inference weights prepare. Failed references retry when preparation recovers, without replacing an already loaded clip. Warm starts inspect validated cache receipts; inference and reference reads still hash the exact decoded bytes. Isolated retries compare matching short-context reference features, including deterministic recording-frame offsets, through the unchanged v3 projection. Synthetic references pass through the browser recording codec without opening a microphone. Every aligned phone must be reliable; otherwise the retry stays uncertain. The global library currently covers 998 words; it is narrower than the 124,082-word phonetic dictionary, and missing recordings are explicitly indicated. Reference audio/timings still await human listening review. No prompt-based or OS/cloud voice fallback fills a missing reference. Other response kinds retain their response/key comparisons and question-specific feedback.

Completing a syllable retry earns **5 XP once per speaking question/word occurrence/syllable each local day**, independent of similarity. Opening review, playback, automatic recognition/grading, silence, failure and cancellation earn no XP. Rewards do not advance daily quest counts or practice streaks. Retry recordings/results remain ephemeral. Upgrading a saved prompt-aligned grade retains its original evidence in `pronunciation` and stores the independent result in `speechAssessment`; recordings and legacy transcripts remain readable. See [word recognition and references](training/WORD_RECOGNITION.md) for provenance, regeneration and limitations. Existing review-only Read Aloud audio and Repeat Sentence source audio remain original authoring assets, not recognition inputs.

The source checkpoint SHA is `2a8e9680e71c85d98f2adc8da725c56f21bd866340cf545916fdf5dff7389d1b`. The browser export keeps its comparison head/reference bank/calibration and uses float16-stored encoder constants with float32 operations. See [browser export and validation](training/checkpoints/blended-english-v3/BROWSER_EXPORT.md), [training process](training/RESUME.md) and the [model card](training/checkpoints/blended-english-v3/MODEL_CARD.md).

Whisper and word-match/pace feedback remain removed. Audio-only wav2vec2 recognition supplies words and timing for all seven speaking types before word-local v3 sound comparison. Previously saved transcripts remain readable with their retained attempts. Old Whisper download caches are inert and can be removed through browser site-storage settings.

Syllable results, transcripts and provenance persist only with retained attempts in IndexedDB; removing browser site data deletes them and recordings. Late saves cannot recreate cleared/pruned attempts or grant XP. The scope-specific model cache survives ordinary app updates and attempt pruning, supports offline reuse and can be removed through browser site-storage settings. Browser storage can be evicted; missing/corrupt files require download again. Cancel stops local scoring; failure retains playback and never invents a score. Low-memory browsers may be unable to initialize the encoder even after download.

```sh
npm run test:comparison
uv run --project training python training/browser_cases.py
npm run test:comparison:browser
npm run test:speech
```

The four-accent browser validation command requires retained local training reference audio to prepare its development controls; those files are intentionally not in Git. Local v3 inference times out after five minutes.

## Practice progress

The practice home has a rotating three-question reading quest, XP levels, daily streaks, weekly activity and six practice achievements. Any mode counts toward the daily goal. Answering a different question earns 10 XP once per local calendar day; reaching three earns a one-time 30 XP bonus. A level takes 150 XP. Empty attempts, passive playback and automatic initial grading earn zero. Completed syllable retries earn the separate 5 XP review reward described above. These are effort milestones, without a proficiency claim.

Quest progress resumes remaining questions. XP, coverage and badges stay in IndexedDB even when older attempts fall outside the ten-attempt history. Game progress starts with newly saved practice after this update; existing attempts, recordings and transcripts are preserved. The app does not offer history deletion; removing browser site data resets saved history and game progress. Public model caches remain separate. Daily records retain up to 365 days; cumulative XP, earned badges and longest streak persist.

The IndexedDB upgrade creates a progress store at version 2 without rewriting old attempts. To roll back the game UI, retain the version-2 database opener; browsers cannot downgrade the database to version 1. Refresh other older app tabs after the update. Rewards appear once in the save confirmation toast; XP, streak and badges remain available through the header and collection screens. Review keeps numbered gap and paragraph comparisons, labels selected and missed options, and shows the spoken replacement for incorrect written words. Writing uses example responses or a labelled planning outline, not a single answer key. Feedback combines playback, item-specific checks, response/key comparisons and source content in one surface, with measured text pages. See [review coverage](docs/review-audit.md).

Focused game checks: npm run test:progress and the daily-quest/browser journeys in tests/practice.spec.ts.

### Practice interface

Home is one large practice screen. Header XP/streak controls open progress; History provides the Achievements action, and the main navigation returns to Practice. Desktop retains its header and icon sidebar; mobile retains its header and the Practice, Learn and History footer tabs, with text below icons. Question types, sections and mock tests remain within Practice. Catalogues use adaptive card pages; saved sessions use compact cards aligned at the top. Single-page pagination is hidden. Learn topic cards and selected article text scroll without pagination. The selected study step is part of the public article URL and survives reload or returning from practice; Overview uses the plain article URL. Question guidance, long responses and saved transcripts use Next/Previous reading pages sized to the actual font and available space. Guides open with Instructions, and related text shares measured pages instead of starting a page per paragraph. Review shows answered questions on a single Feedback surface without panel tabs. Speaking feedback uses independently recognised words with syllable scores, optional prompt differences and word-selected listening/practice; other questions retain integrated source, response/key comparisons and specific explanations. Legacy speech evidence remains readable without a saved recording. Returning from a question guide retains the catalogue page and filters. When tab storage is available, the question-type search, filters and page also survive reloads in that tab; these preferences stay on device and separate from saved learner data.

The app stays within a fixed device viewport without document scrolling. App-controlled pinch/double-tap, modifier-wheel and keyboard zoom are disabled; browser menus and operating-system accessibility overrides remain user-controlled. Very short windows scroll only the main content panel so controls remain reachable (below 450 CSS pixels generally, and up to 560 pixels for the daily practice home). The timed test surface keeps its independent exam layout and content scrolling where needed; this redesign changes the practice workspace and post-attempt review.

Screen destinations include `/progress`, `/achievements`, `/types/:guideID`, `/sections/:sectionID`, `/guide/:topicID`, `/mocks`, `/history/:sessionID` and `/practice/:mode/:practiceID`. The active runner adds `/run`; refresh or forward navigation without a live attempt returns to preflight. Routes contain IDs only, never responses or transcripts.

`src/components/AudioPlayer.tsx` owns shared local playback with play/pause, keyboard seeking, time, errors and retry. It uses the existing shadcn Button and shared practice surface/control tokens in `src/screens.css`. Only one review/preflight player plays at a time. The headphone check uses a separate three-second tone sequence, generated with `python3 scripts/generate-headphone-check.py`, so question recordings stay reserved for the timed attempt. The timed runner keeps its one-play lifecycle and uses the shared start button when browser audio needs a gesture. Native controls are not exposed.

The [practice cleanup coverage audit](docs/ui-cleanup-coverage.md) inventories every question type, section, mock and shared screen owner, including retained controls and validation limits.

The public shell includes a bundle-independent reload control for failed startup. A new offline worker can rescue a provably broken older cached shell after its replacement pack is complete, provided no scoped tab is in an active attempt. Normal coherent updates remain user-controlled. Recovery retains learner storage and the model cache.
