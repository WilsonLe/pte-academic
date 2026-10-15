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

Open `http://127.0.0.1:4178`. The stack is React 19.3, TypeScript 7, Vite 8.3, Tailwind 4.3, and shadcn's default Nova preset with Base UI and neutral tokens. Geist is bundled locally. Generated shadcn components and default helper CSS are committed; the scaffolding CLI is run through `npx shadcn@latest` when adding components, rather than shipped as an application dependency. There is no backend or cloud runtime AI. Opt-in speech recognition runs locally in a browser worker.

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

Keep the trailing slash. Browser routing uses real paths such as `/history` and `/history/:sessionID` (under the configured base path). Configure the static host to rewrite application routes to `index.html`; Vite preview already does this. The service worker handles cached route navigation offline. Older `#history` and other top-level hash links are converted on entry. Use HTTPS for microphone and service-worker support; localhost also works for development. No hosting provider or automatic deployment is configured by this change.

Open the built site online and check the cloud status icon for **Offline ready** before disconnecting. Browser storage may still be evicted. A new pack is offered for explicit reload so an active attempt is not interrupted. Installation uses the browser's Install option or Share → Add to Home Screen on iOS.

## Content and audio management

Edit original JSON and media through Git, following the nested agent instructions. Validation checks schemas, references, unique mock IDs, order and media integrity. It runs before every build.

This Codex session has no native text-to-speech generation tool. The operator selected OpenRouter, used only by the local authoring CLI:

```sh
npm run openrouter -- login
npm run openrouter -- status
npm run openrouter -- plan
npm run openrouter -- tts --confirm-spend --max-usd 0.25
```

The operator authorized a **US$10 total project budget**. Passing or increasing it requires asking the operator. The provider key is capped without a reset, and a local cumulative reservation ledger guards each request. A per-run allowance cannot bypass the total. Credentials and ledger stay in gitignored `.cli/openrouter/`, never the site bundle. No automatic paid retries or credit purchases occur. See [audio authoring](agents/audio-author.md) for setup, supported models, macOS audio-inspector prerequisite and review requirements.

Audio is synthetic; group discussions currently use a narrator identifying three speakers. Generation provenance and honest listening-review status live in `content/narration.json`. A successful API response is not evidence of pronunciation quality.

## Local speaking feedback

Open a speaking response in Review and select **Transcribe**. First use downloads about 60 MB of public English speech files. Quantized Whisper Tiny English and ONNX WASM run in a dedicated worker; recordings and transcripts stay on the device. The normal offline pack does not fetch speech code/weights. Once used successfully, speech assets and weights are cached for offline reuse; browser storage can be evicted. Cancel stops the worker; failures leave playback available. A changed app runtime may require another download.

Read Aloud and Repeat Sentence show normalized word-match accuracy, deducting missing, substituted and extra recognized words. Short answers compare the key, ignoring punctuation/case and a leading article. Other speaking types show recognized text, word count and average words per minute including pauses; they keep content self-review. Silence gets no numeric score. Recognition can mishear accents/noise or hallucinate, so these are practice aids without pronunciation/fluency assessment or a predicted PTE score.

Transcripts and model provenance are stored with attempts in IndexedDB; clearing history removes transcripts and recordings. Cache Storage retains public model/runtime files; clear site storage through browser settings to remove those too. Model: `onnx-community/whisper-tiny.en`, revision `2575352d61be1bf7225cf8f8b268a4678025fc58`, q8; Transformers.js 4.3.1, WASM single thread. Recording input is bounded to two-minute tasks (five-second tolerance) and 24 MiB encoded. Inference times out after five minutes; slower or low-memory browsers may need replay/self-review.

```sh
npm run test:speech
npm run test:speech:browser
```

Implementation references: [Transformers.js](https://huggingface.co/docs/transformers.js/index), [model](https://huggingface.co/onnx-community/whisper-tiny.en).

## Practice progress

The practice home has a rotating three-question reading quest, XP levels, daily streaks, weekly activity and six practice achievements. Any mode counts toward the daily goal. Answering a different question earns 10 XP once per local calendar day; reaching three earns a one-time 30 XP bonus. A level takes 150 XP. Empty attempts earn zero and replaying a review or transcribing an answer never earns XP. These are effort milestones, without a proficiency claim.

Quest progress resumes remaining questions. XP, coverage and badges stay in IndexedDB even when older attempts fall outside the ten-attempt history. Game progress starts with newly saved practice after this update; existing attempts, recordings and transcripts are preserved. Clearing history also resets game progress, as the dialog explains. Public model caches remain separate. Daily records retain up to 365 days; cumulative XP, earned badges and longest streak persist.

The IndexedDB upgrade creates a progress store at version 2 without rewriting old attempts. To roll back the game UI, retain the version-2 database opener; browsers cannot downgrade the database to version 1. Refresh other older app tabs after the update. Rewards appear after saving, with finite celebrations and reduced-motion support; no game effects run inside a timed test.

Focused game checks: npm run test:progress and the daily-quest/browser journeys in tests/practice.spec.ts.

### Practice interface

Home is one large practice screen, with progress and achievements behind the flame and trophy buttons. Desktop retains its header and icon sidebar; mobile retains its header and the Practice, Learn and History footer tabs, with text below icons. Question types, sections and mock tests remain within Practice. Catalogues use adaptive card pages; saved sessions use compact cards aligned at the top. Single-page pagination is hidden. Question guidance, beginner lessons, long responses, transcripts and word comparisons use Next/Previous reading pages sized to the actual font and available space. Review shows one question and one selected response/key/feedback/prompt/speech panel at a time. Returning from a question guide retains the catalogue page and filters.

The ordinary learning workspace fits the device viewport without document scrolling. Windows below 450 CSS pixels high (including extreme zoom) deliberately regain scrolling so enlarged controls remain reachable. The timed test surface keeps its independent exam layout and content scrolling where needed; this redesign changes the practice workspace and post-attempt review.

Screen destinations include `/progress`, `/achievements`, `/types/:guideID`, `/sections/:sectionID`, `/guide/:topicID`, `/mocks`, `/history/:sessionID` and `/practice/:mode/:practiceID`. The active runner adds `/run`; refresh or forward navigation without a live attempt returns to preflight. Routes contain IDs only, never responses or transcripts.

`src/components/AudioPlayer.tsx` owns shared local playback with play/pause, keyboard seeking, time, errors and retry. It uses the existing shadcn Button and shared practice surface/control tokens in `src/screens.css`. Only one review/preflight player plays at a time. The timed runner keeps its one-play lifecycle and uses the shared start button when browser audio needs a gesture. Native controls are not exposed.
