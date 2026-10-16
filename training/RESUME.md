# Training pause and resume guide

Paused on **2026-10-16**: the operator accepts **blended-English v3** for now. No further training or paid generation is scheduled. American, British, Australian and Indian English remain equally valid references. The operator explicitly chose to keep training audio out of Git.

## Start here next time

Use [the training README](README.md) for implementation details and [the v3 model card](checkpoints/blended-english-v3/MODEL_CARD.md) for measured results and limitations. This guide records the accepted stopping point and how to resume without relying on chat history.

- Accepted checkpoint: `training/checkpoints/blended-english-v3/model.pt`.
- SHA-256: `2a8e9680e71c85d98f2adc8da725c56f21bd866340cf545916fdf5dff7389d1b`.
- Model delivery/source snapshot: commit `da458299dccba63f513941eedb1702ddc13121b1`, [PR #19](https://github.com/WilsonLe/pte-academic/pull/19), depending on [PR #17](https://github.com/WilsonLe/pte-academic/pull/17). Both were open drafts at this pause; a new clone of `main` may not contain them. Fetch the named commit/branch and inspect current PR state rather than assuming a merge.
- Exact fitting implementation: commit `8827348`; source/config/lock hashes are in [artifact-summary.json](checkpoints/blended-english-v3/artifact-summary.json) and [training.json](checkpoints/blended-english-v3/training.json).
- Current retained working checkout: `/Users/wilsonle/projects/pte-academic.worktrees/syllable-comparison`. Its branch may change; use commit and artifact hashes for identity.

This is a local Python research model. It is not integrated into the PWA, exported for browsers or validated against human pronunciation ratings. Its 0–100 syllable values measure reference similarity, not percent correct or an exam score. Keep stress/timing evidence separate, and preserve null scores for uncertain/unsupported sounds.

## What must survive outside Git

Paths below are relative to the retained checkout. **Do not delete or archive that worktree until its ignored files have been preserved and verified elsewhere.** Git snapshots and PRs do not back them up. No additional backup or upload was made as part of this documentation task.

| Asset | Location | Recovery / importance |
| --- | --- | --- |
| Generated audio, scripts and complete manifests | `artifacts/pronunciation/reference-v1/`, `reference-v2/`, `reference-v3/` | Preserve originals. V3 has 5,600 audio files, about 431.14 MiB of audio / 436.25 MiB including metadata. V2 contains 5,000 reused files; v1 has 400. These versions overlap; all are retained locally. |
| V3 audit with exclusion transcripts/reasons | `artifacts/pronunciation/corpus-audit-v3.json` | A compressed copy is committed beside the checkpoint. Audit rows can be reused only for matching audio hashes. |
| V3 feature caches | `artifacts/pronunciation/features-v4/` | Rebuildable from the exact audio and pinned encoders. `features-v1/` through `features-v3/` belong to earlier experiments; do not mix representations. |
| Pinned acoustic/recognition weights | `artifacts/pronunciation/encoders/` | Explicitly downloadable again; required for inference as well as preparation. The small comparison checkpoint alone is insufficient. |
| Training attempts, validation, verification and timings | `artifacts/pronunciation/runs/`, `verification*/`, other local evidence JSON | Preserve unsuccessful attempts as well as the selected run. Selected v3 evidence is committed under `training/checkpoints/blended-english-v3/`. |
| Python environment | `training/.venv/` | Recreate from `training/pyproject.toml` and `training/uv.lock`; do not commit it. |
| Provider credential and complete spending ledger | `.cli/openrouter/` | Private, ignored, owner-only. Keep token and ledger in a secure owner-controlled copy, separate from any shareable dataset archive. Never print or commit them. Directories 0700, token/ledger 0600. |

The canonical checkout also has a reconciled private ledger. Before moving work, verify that copies agree and no authoring process is active. Do not overwrite a newer ledger with an older copy. Paid calls are serialized through the existing lock; separate worktree copies are not permission to author concurrently.

A fresh clone contains the fitted checkpoints, config, scripts, dependency lock, compressed provenance and reports, **not raw training audio**. For inference, restore/download pinned encoders. For retraining, restore the raw folders from the retained local copy and verify hashes against the manifests. Committed `reference-manifest.json.gz` and `corpus-audit.json.gz` contain metadata, not recoverable audio. Missing audio cannot be reconstructed byte-for-byte from its text/hash; synthesis would be a new paid operation with different output. If the retained data is lost, stop and plan recovery rather than automatically regenerating it.

## What produced v3

1. **Define references and splits.** [reference-corpus-v3.json](reference-corpus-v3.json) contains 560 passages, ten synthetic profiles and four accents. Locale labels describe configured synthesis voices, not independently verified human accents. Families stay wholly within one split. Six profiles provide fitted/calibration data; `am_puck`, `bm_george`, `au_bloke` and `in_dhruv` are entirely held out from fitting/reference banks.
2. **Generate only missing references.** The v1 corpus had 400 American examples; v2 expanded to 5,000 across four accents. V3 reused those 5,000 exact files and added 600 recordings for 60 fresh test families. It did not add new training audio or distinct AU/IN voices: live discovery exposed no additional independent identities. Each take records model/voice, text/audio hashes and honest listening status. Generation shares the private ledger and has no automatic paid retries.
3. **Audit and prepare.** Decode and recognize speech; exclude unusable takes and recognition word error above 25%. This is an automated script-coverage guard, not a pronunciation judgment. V3 accepted 5,532 of 5,600 takes. Align phonemes using passage-wide US/GB pronunciation candidates and estimate syllable boundaries/prosody. Frozen wav2vec encoders supply acoustic/phonetic evidence.
4. **Fit small heads locally.** The comparison head learns sound classification plus cross-voice contrastive structure, with training-only reference banks. A separate head learns stress. Actual fitting used 2,087 recordings / 137,967 sound segments. V3 features concatenate the original layer-7 acoustic mean with the full observed CTC log-probability vector (`hidden-ctc-v1`), never the target phone or accent ID. Caches/checkpoints bind the representation; old models retain `hidden7`.
5. **Select/calibrate on development data.** V3 retained 350 training passages; 150 previously exposed validation/test passages became development validation. Sampling/banks/stress and common per-phone calibration/duration distributions balance accents. Select the epoch by equal-accent macro validation accuracy. One shared score scale; no accent-specific score inflation.
6. **Freeze, then test.** Preserve model, validation and source hashes in [freeze.json](checkpoints/blended-english-v3/freeze.json) before observing fresh test results. Evaluate v2 and v3 on identical new audio/alignment from families 501–560. [paired-comparison.json](checkpoints/blended-english-v3/paired-comparison.json) records both identities and all accent results. Check actual saved-model inference, wrong-sound controls, silence/noise, gain, reload and denied-network behavior separately.

Held-out-profile sound classification improved AU **86.15 → 92.58%**, IN **88.94 → 93.55%**, GB **93.89 → 95.96%**, US **94.61 → 97.47%**. These synthetic sound classification results do not establish accuracy of human syllable scores. The fast Australian sample still scores only 20/21 syllables, with median similarity 58.695; human listening and consented learner evaluation remain pending.

## Use the accepted model without retraining

Run commands from the repository root, after confirming that the checkout contains v3. Python 3.12 and `uv` are required. These setup commands install pinned dependencies and explicitly download public weights if needed; they do not synthesize paid audio:

```sh
uv sync --project training --locked
uv run --project training python training/download_models.py
shasum -a 256 training/checkpoints/blended-english-v3/model.pt
```

Once the weights are present, prediction loads local files only:

```sh
HF_HUB_OFFLINE=1 uv run --project training python training/comparison.py predict \
  --model training/checkpoints/blended-english-v3/model.pt \
  --audio /absolute/path/to/recording.wav \
  --text 'The sentence the learner intended to read.' \
  --output artifacts/pronunciation/prediction.json
```

Omit `--text` for audio-only inference; that scores recognized content and cannot establish whether the intended words were read. Recording/transcript data stays local. Input is limited to 125 seconds. Inspect per-syllable status and alignment confidence alongside similarity; confidence is not correctness probability.

## Resume training only when requested

Create/refine a tracking issue and isolated feature branch under the repository workflow, using v3 as the preserved baseline. Read `AGENTS.md`, this guide and current authoring policy first. Specify the experiment and acceptance evidence before spending or fitting. Do not overwrite accepted checkpoints, old configs, failed runs or historical ledgers.

**Reproduce the existing training setup:** with retained audio/audit available, these commands reuse v3 inputs and write a new run. Choose a new, unused output directory each time. Preparation/audit can resume hash-matched work; fitting is a new run, not optimizer-state resumption. Seed/dependencies are recorded, but exact accelerator reproducibility is not guaranteed.

```sh
uv run --project training python training/comparison.py prepare \
  --config training/reference-corpus-v3.json --device auto --batch-size 16 --workers 8
uv run --project training python training/audit_corpus.py \
  --config training/reference-corpus-v3.json --device cpu --threads 8 --batch-size 8 --workers 4
uv run --project training python training/comparison.py train \
  --config training/reference-corpus-v3.json \
  --output artifacts/pronunciation/runs/resumed-v3-candidate-1 \
  --epochs 30 --device auto --threads 16 --batch-size 2048
uv run --project training python training/comparison.py evaluate \
  --config training/reference-corpus-v3.json \
  --model artifacts/pronunciation/runs/resumed-v3-candidate-1/model.pt \
  --output artifacts/pronunciation/runs/resumed-v3-candidate-1/validation.json
```

**Improve the model:** create a new versioned config, output directory, feature directory when semantics change, and separate audit path. Preserve existing speaker/family exclusions. V3's final-test families 501–560 are now exposed; they cannot serve as a fresh final test for future model selection. Treat them as exposed development/regression evidence, retaining their original historical reports. Assign genuinely new families/held-out evaluation data before candidate selection. Evaluate validation and actual local controls first; freeze model, config, source and validation hashes, then use the new final test once. Never adjust the candidate using final-test results or compare headline metrics from different test sets.

Baseline evaluation across a new corpus requires explicit `--transfer`; only compatible phonetic labels and the supported `hidden-ctc-v1` → `hidden7` prefix conversion are allowed. Normal evaluation retains manifest/version checks. `evaluate --include-test` opens the configured final test: run it only after the new experiment's freeze, not as routine development verification. No fresh final-test command is run by this guide.

For possible new synthesis, run the **read-only plan** against the proposed versioned config, verify live voice/model/pricing availability, and inspect incremental missing-take costs. The existing v3 plan is:

```sh
node scripts/reference-corpus.mjs plan --config training/reference-corpus-v3.json
npm run openrouter -- status
```

Only a later explicitly requested experiment should execute `generate --confirm-spend`. The README documents that command. Choose its batch ceiling after the live plan: it describes the full configuration estimate, including reused recordings, while cumulative guards reserve only new calls. Use the existing key, ledger and authoring lock. Reconcile failed/uncertain calls before resuming; never repeat a possibly billed call automatically.

## Budget and speed at this pause

Budget snapshot, **2026-10-16**: 5,736 completed reservations total **US$7.0113639**. The operator then granted a fresh **US$10**, yielding cumulative cap **US$17.0113639**, on the existing key with no periodic reset. The fresh allowance was unused at this pause. This is historical status, not a guarantee of future available credit. Re-read `content/authoring.json`, the complete private ledger and live provider status before any new paid work; both provider usage and conservative reservations gate requests. Preserve the recorded authorization/cutoff/hash. No reset, new key or automatic renewal may evade the cap. See [budget.json](checkpoints/blended-english-v3/budget.json) and [audio authoring guidance](../agents/audio-author.md).

Measured on this 18-core / 48 GiB Apple Silicon host: one MPS encoder, batch 16 and eight CPU workers prepared 5,600 files in 384.59s (~14.56 files/s); comparison plus stress fitting took 44.84s with batch 2,048 and 16 CPU threads. CPU audit used eight Torch threads. The 600 new TTS calls took 179.12s at concurrency 16, paced four starts/s; incremental reserved estimate was US$0.6909603. See [performance.json](checkpoints/blended-english-v3/performance.json). Two large simultaneous MPS encoders caused contention; maximum worker counts were not fastest. Benchmark separately if hardware/settings change. Sampled GPU allocation is not a measured peak RAM footprint.

## Verify and hand off the next candidate

Focused existing contracts (no paid requests):

```sh
node --test tests/openrouter.test.mjs tests/reference-corpus.test.mjs
uv run --project training python -m unittest discover -s training -p 'test_*.py' -v
```

For a future model change, exercise the saved-model path with `training/verify_inference.py --model ... --config ... --output ...` through `uv run --project training python`; it uses the configured retained reference corpus and writes local controls. Record what actually ran. Validate raw/model/config/source/freeze hashes, split/family and held-out-profile identities, all-accent metrics, wrong-sound controls and legacy compatibility. Package the actual checkpoint and provenance with a model card. Keep raw data/caches/private files out of Git and `dist/`, as the operator chose. Run relevant build/isolation checks when affected; full suite is reserved for a merge request. Obtain one independent review of the new draft PR under the workflow; review is not merge/deploy authority.

At the v3 pause, focused Node/Python/content checks, static build, artifact identity/isolation and actual offline inference passed. The independent review of PR #19 found no actionable issues; [its record](https://github.com/WilsonLe/pte-academic/pull/19#issuecomment-6205591108) separates author-run metrics from reviewer checks. No human listening/learner validation, browser export or deployment was claimed. Next useful evidence is consented human reference/learner evaluation, particularly Australian/Indian speech, rather than treating more synthetic examples as proof of human validity.
