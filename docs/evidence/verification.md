# Local verification — 15 October 2026

Scope: new static PWA setup in the isolated `codex/pwa-practice` worktree. No merge, deployment, hosted CI, certified scoring or exact live-test visual parity is claimed.

| Boundary | Evidence |
| --- | --- |
| Content | Validator passes 22 guides, 65 original questions, one complete mock, local audio integrity and script hashes |
| Feedback | Five focused content tests pass: answer penalties, adjacent pairs, blanks/dictation and writing guidance |
| Authoring budget | Three Node checks pass: character costs, unknown pricing rejection and cumulative $10 boundary |
| Build | TypeScript 7 and Vite 8 production build passes; static output contains manifest/icons/local fonts/36 MP3 prompts/versioned worker |
| Browser | 13 focused Chrome scenarios pass across scoped runs; covers onboarding/mobile, selected answers, gaps, word bank/reordering, writing timer, single-play audio, microphone/recording persistence, section/mock transitions, offline, multi-answer deductions, dictation and permission failure |
| Subdirectory | /pte-academic/ build and offline browser journey pass, including cached HTTP 206 media byte range |
| Dependencies | npm audit reports zero known vulnerabilities after keeping the shadcn scaffolding CLI out of the application dependency tree |
| Provider | Live OpenRouter speech generation produced all 36 MP3s. Key readback: US$10 total limit, US$0.175072 used, US$9.824928 remaining. Owner-only gitignored credentials/ledger; no credential data in build |
| Privacy | GitHub readback confirms repository visibility PRIVATE |

Browser tests use real Chromium audio/recording/storage APIs with a synthetic microphone. Accelerated clocks verify deadline transitions; they do not represent a human sitting the entire exam. Generated speech has measured durations and provenance, with human listening review still pending. Screenshots verify layout only.

One development run had two selectors matching duplicate task/review labels; those were scoped to the intended reading task/first review item. Concurrent root/subdirectory runs initially shared Playwright artifact output; their output directories are now separate, and affected checks pass. The original offline reload failure was traced to `Vary: Origin` on static assets; cache lookups now ignore that variation for the bundled same-origin pack. Offline reload/media checks pass at both root and subdirectory boundaries.

The build reports an approximately 530 kB uncompressed application chunk. It is cached with the offline pack; no performance benchmark or slow-device claim is made. Full repository checks are deferred until merge is requested.

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
