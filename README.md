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

Open `http://127.0.0.1:4178`. The stack is React 19.3, TypeScript 7, Vite 8.3, Tailwind 4.3, and shadcn's default Nova preset with Base UI and neutral tokens. Geist is bundled locally. Generated shadcn components and default helper CSS are committed; the scaffolding CLI is run through `npx shadcn@latest` when adding components, rather than shipped as an application dependency. There is no backend or runtime AI.

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

Keep the trailing slash. Hash navigation avoids server route rewrites. Use HTTPS for microphone and service-worker support; localhost also works for development. No hosting provider or automatic deployment is configured by this change.

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
