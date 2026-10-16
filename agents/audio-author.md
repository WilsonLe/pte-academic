# Audio author

Use the agent host's native speech tool if one is actually exposed and authorized. This Codex session has no native TTS-generation tool. The operator chose OpenRouter as the development-time provider; do not silently substitute Piper, OS voices or browser speech synthesis.

## Authorized budget

Current cumulative cap: US$17.0113639, with no daily/monthly reset. The original US$10 cap was explicitly extended on 2026-10-16 by a fresh US$10 allowance after US$7.0113639 had been reserved. The existing ledger is preserved; the new allowance is not permission to erase old costs. Ask the operator before passing or increasing the cap. `content/authoring.json` is the tracked policy. `.cli/openrouter/spending.json` conservatively reserves estimated cost before each paid request; failed/uncertain requests retain reservations. The CLI also checks provider usage and key cap. Never reset either mechanism or use another key to evade it.

## Setup and commands

Run in the isolated project worktree:

```sh
npm run openrouter -- login
npm run openrouter -- status
npm run openrouter -- models
npm run openrouter -- plan
npm run openrouter -- tts --question repeat-sentence-01 --confirm-spend --max-usd 0.25
```

`login` starts a loopback-only OAuth PKCE callback. Open its authorization URL in the supported host browser. The operator signs in and authorizes the project key. The code is exchanged internally; token bytes never need to enter chat. Stored credential: `.cli/openrouter/token`, gitignored, mode 0600 in mode-0700 directories. Existing tokens are preserved. The status command reports authentication and limits, never token labels or contents.

Before generation set the OpenRouter key's total credit limit to the authorized cumulative cap in `content/authoring.json`, without a reset, then verify with `status`. `--max-usd` is a per-batch ceiling that cannot bypass the project cap. `plan` performs public model discovery and estimates character costs without synthesis. Models with unknown or output-based pricing cannot pass bounded planning in this first CLI version. Default: Voxtral Mini TTS with en_paul_neutral; choose another listed model/voice together when authorized.

## Generation, failure and review

The current inspector uses macOS `afinfo` and must be available before paid calls. Generate original scripts only. No learner response is ever sent to OpenRouter. The CLI checks response MIME and file size, inspects measured duration, saves MP3s and provenance, and checkpoints each successful question. Matching completed takes are retained when resuming; different existing takes are never overwritten automatically. No automatic retry is made after a failed or uncertain paid request. Reconcile the provider log and local ledger before removing a stale generation lock or pending take.

Inspect the generated file by decoding and listening, check script coverage and actual duration, then update listening status truthfully. The initial release marks takes pending human listening review. Group-discussion scripts currently use one narrator identifying three speakers; distinct-voice authoring is a future content improvement, not a capability to claim today.

The website ships only reviewed/labelled static media. No credentials, authoring SDK, `.cli/`, model files or Python environment belong in `dist/`. Run validation/build and check an audio task offline before PR handoff.

## Pronunciation reference research

`node scripts/reference-corpus.mjs plan --config training/reference-corpus-v2.json` and `generate --config training/reference-corpus-v2.json --concurrency 16 --confirm-spend --max-usd <ceiling>` generate the separate versioned synthetic English training corpora described in `training/README.md`. This command shares this CLI's concealed credential access, generation lock, ledger and currently authorized cumulative cap. It stores recordings and provenance under ignored `artifacts/pronunciation/`, never under `public/` or in the practice question bank. The operator separately authorized training on these generated references; that does not imply human listening review, validated proficiency scores, runtime provider calls, or deployment authority. Preserve the local artifact folder when retiring a worktree. Failed or uncertain paid reservations must be reconciled before resuming; a new command is not permission to repeat a possibly billed request.
