# English pronunciation comparison experiment

**Training is paused at accepted v3 (2026-10-16).** Start with the [pause and resume guide](RESUME.md) for the checkpoint, local data to preserve, budget snapshot and future restart procedure. The operator chose to keep training audio out of Git.

This development-only pipeline generates synthetic English reference speech through OpenRouter, trains a local comparison model, and returns a reference similarity index for every supported syllable in a local recording. It is separate from PTE Studio's learner-facing Whisper review. The PWA uses its derived browser export for v3 syllable sound similarity; raw training inputs and Python runtime are not imported into the app.

The operator authorized generated-output training. The current authorized cumulative cap is **US$17.0113639**: on 2026-10-16 the operator explicitly granted a fresh US$10 allowance after US$7.0113639 in reservations. The original spending history remains intact; there is no automatic reset. `content/authoring.json` records the authorization. The corpus generator reads the existing private credential internally and shares the authoring lock and conservative spending ledger. Never reset the ledger, automatically retry a failed paid request, or put a credential in a command argument.

## Reference recordings

The preserved `reference-corpus.json` baseline contains 100 original passages and four American Kokoro profiles (400 recordings). The expanded `reference-corpus-v2.json` contains 500 passages and ten synthetic profiles (5,000 recordings): American, British, Australian and Indian English. All four groups are accepted references for v2; v1 remains an American-only comparison.

The expanded texts comprise the original 100 passages plus 100 new scene families with four framing contexts each. There are 200 topic/scene families, not 500 independent topics. Each family belongs wholly to training, validation or final test. Locale labels describe the configured synthetic voices, not verified human accent membership.

```sh
npm ci
node scripts/reference-corpus.mjs plan --config training/reference-corpus-v2.json
node scripts/reference-corpus.mjs generate --config training/reference-corpus-v2.json --concurrency 16 --requests-per-second 4 --confirm-spend --max-usd 7
```

Review the live estimate first. The batch ceiling never overrides the currently authorized cumulative cap. Concurrency accepts 1–32 workers. Request starts are paced at four per second by default (`--requests-per-second`, greater than zero and at most 32); an unpaced 32-worker burst reached a provider preflight rate limit, so higher concurrency alone is not a throughput guarantee. One serialized coordinator reserves budget and checkpoints each manifest/ledger mutation, while independent requests overlap. A failed request stops new scheduling and drains in-flight work. There are no automatic paid retries. Failed/uncertain reservations block resumption until reconciled.

Matching completed takes are hash checked and retained; 300 matching baseline recordings are reused in v2. Files include synthetic flags, model/voice/accent, split/family, generation-header ID, script/audio hashes, duration and truthful listening status. Decoder or recognizer checks do not establish human listening review. Public model availability and prices are verified when planning/generating.

Local audio is under `artifacts/pronunciation/reference-v1/` and `reference-v2/`. Large working artifacts are ignored by Git and excluded from the static build. Preserve these folders when retiring the worktree. Checked-in checkpoints and evidence live under `training/checkpoints/`.

## Local environment and training

Requires Python 3.12 and [uv](https://docs.astral.sh/uv/). Dependency versions and transitive packages are pinned in `uv.lock`. This run uses Apple Silicon locally; CUDA/MPS is not required for the small trained heads.

```sh
uv sync --project training
uv run --project training python training/download_models.py
uv run --project training python training/comparison.py prepare --config training/reference-corpus-v2.json --batch-size 32 --workers 8
uv run --project training python training/audit_corpus.py --config training/reference-corpus-v2.json --batch-size 8 --workers 4 --device cpu --threads 8
uv run --project training python training/comparison.py train --config training/reference-corpus-v2.json --output artifacts/pronunciation/runs/blended-candidate-1 --epochs 30 --device auto --batch-size 2048 --threads 16
uv run --project training python training/comparison.py evaluate --config training/reference-corpus-v2.json --model artifacts/pronunciation/runs/blended-candidate-1/model.pt --output artifacts/pronunciation/runs/blended-candidate-1/validation.json
```

Model setup explicitly downloads pinned public weights once. Feature preparation and the corpus audit optionally accept `--follow` while the paid generator is demonstrably live. Training requires the complete corpus and matching completed audit. Audit rejects undecodable/non-speech audio and excludes takes with recognition word error over 25%; this threshold is an automated label-coverage guard, not a pronunciation judgment. The audit stores the recognized text for inspection.

The frozen acoustic encoder is [`facebook/wav2vec2-xlsr-53-espeak-cv-ft`](https://huggingface.co/facebook/wav2vec2-xlsr-53-espeak-cv-ft), revision `2c733782da5604684829819a5eb744c193fe9398`. [`facebook/wav2vec2-base-960h`](https://huggingface.co/facebook/wav2vec2-base-960h), revision `22aad52d435eb6dbaf354bdad9b0da84ce7d6156`, supplies independent transcription and optional audio-only word recognition. Setup converts the phoneme model's original PyTorch state dictionary to safetensors locally. No remote model code is executed.

For v1 a CMU pronunciation lexicon supplies sound identities and lexical stress. For v2 local eSpeak-ng supplies US and British pronunciation candidates, including rhotic/nonrhotic variants; the acoustic aligner chooses the better-supported complete candidate. Australian and Indian recordings broaden the acoustic reference bank but do not have separate locale-specific pronunciation dictionaries. eSpeak is used for text-to-phoneme conversion only; reference speech is generated through the configured OpenRouter providers. A maximal-onset syllabifier partitions words; CTC Viterbi alignment estimates sound times, including repeated sounds separated by blanks. English compound entries for `footbridge` and `whiteboard` combine existing lexicon pronunciations explicitly. Unsupported words cause an unscored result rather than shifting later boundaries.

The comparison head is an actual learned nonlinear projection, optimized using sound classification plus cross-voice supervised contrastive loss. Its reference bank contains training sound embeddings only. It preserves several realizations per sound instead of collapsing all examples to one ideal voice. A separate learned stress head uses syllable acoustic features and word-relative duration, energy and pitch. Timing comparisons use training sound-duration distributions.

The stable split is assigned before training:

- v2 has 350 training, 75 validation and 75 test passages, with families kept together.
- Six profiles supply training/calibration/test recordings. Four additional profiles (`am_puck`, `bm_george`, `au_bloke`, `in_dhruv`) are entirely excluded from training and the reference bank, providing one held-out profile per accent group. Only their validation/test passages are evaluated; their training-text recordings are unused.
- Training sampling and the bounded reference bank balance accent groups. Calibration uses only validation passages from training profiles. Evaluation reports each accent separately as well as overall metrics.
- v1 retains its original 70/15/15 passage split, three training profiles and held-out `am_puck`.

Training records epochs, losses, model selection, split IDs, dependency/source hashes, reference manifest hash and checkpoint hash. Calibration maps reference distances to a 0–100 similarity index: 85 at a sound's held-out median distance, 60 at its held-out 95th percentile. These choices define an experimental index; they are not probabilities or percent correct. Sparse sound calibration returns an unsupported result. Do not tune models against final test results.

Freeze a candidate after validation, then run `evaluate --include-test` once for final test evidence. Keep unsuccessful runs and their validation metrics so model selection remains inspectable.

## Resource use

On the 18-core, 48 GiB Apple Silicon host, feature preparation uses one MPS phonetic encoder, eight CPU alignment/prosody processes and a bounded decoder pool. Transcript auditing runs concurrently on CPU with eight Torch threads. Two large MPS encoder processes caused shared-memory contention; splitting GPU preparation from CPU auditing restored throughput. Keeping only the required hidden layer, bucketing padded lengths, releasing GPU tensors and using CPU processes reduces memory pressure. Native libsndfile MP3 opening is serialized because concurrent initialization crashed in `mpeg_init`; resampling and feature work remain parallel.

Use `--follow` on preparation/audit to process incoming generator checkpoints. Each stage resumes completed, hash-verified work. Benchmark GPU batches with `python training/benchmark.py` after preparation finishes; running another large GPU process alongside preparation distorts results. `batch-benchmark.json` and the final model card record measured settings rather than assuming maximum worker count is fastest. CPU training is also supported with `--device cpu`.

## Predict from a local recording

```sh
uv run --project training python training/comparison.py predict \
  --model training/checkpoints/blended-english-v3/model.pt \
  --audio /absolute/path/to/recording.wav \
  --text 'The sentence the learner intended to read.' \
  --output artifacts/pronunciation/prediction.json
```

Omit `--text` for audio-only inference. That path scores the words the recognizer identifies; it cannot establish whether an intended word was read correctly. Model loading during prediction is strictly local (`local_files_only=True`). No recording, transcript or feature is sent to a provider. `HF_HUB_OFFLINE=1` can enforce offline public-model access as well.

Each syllable result includes word/syllable index, phonetic label, start/end seconds, sound similarity, stress evidence for words with several syllables, timing similarity, alignment confidence and status. The main similarity currently aggregates sound similarities; stress and timing remain separate evidence. Alignment confidence is acoustic alignment evidence, not a calibrated probability that the pronunciation is correct. Low-confidence or unsupported segments retain null scores. Silence and broadband noise return no reliable speech. Input duration is limited to 125 seconds.

## Validation and limits

```sh
node --test tests/openrouter.test.mjs tests/reference-corpus.test.mjs
uv run --project training python -m unittest discover -s training -p 'test_*.py' -v
npm run build
```

The experiment tests synthetic unseen-text/voice generalization, sound discrimination, stress classification and actual local inference. A reference distance is not established merely by successfully transcribing the words. Decoder quality, timing boundaries, recognition errors and reference coverage affect results.

Synthetic positives establish the chosen generators' reference distribution. They cannot establish human English pronunciation validity, intelligibility, proficiency, or certified exam scores. Human listening review of references and a separate consented human-speaker evaluation remain necessary before learner-facing diagnostic claims. Similarity to this corpus can change with context and is not evidence that every accent difference is an error. The prototype does not validate mouth/tongue correction advice.

The fitted checkpoint remains a Python research artifact. Its subsequently authorized browser export powers local Read Aloud/Repeat Sentence sound similarity; see [browser export](checkpoints/blended-english-v3/BROWSER_EXPORT.md) for scope and verification. No broad mobile performance or human diagnostic validity is established. The pinned pretrained encoders are larger than the trained comparison heads; model setup downloads them separately. See the checked-in model card/evidence for the actual completed run and measured limitations.

## Australian/Indian generalization iteration (v3)

`reference-corpus-v3.json` preserves the existing ten profiles and all 5,000 audio files. It adds 60 fresh, independent final-test passages (600 recordings), reuses the existing 350 training passages and treats all 150 previously exposed validation/test passages as development validation. The original held-out profiles remain excluded from fitted data and the reference bank. Do not use the fresh final test to select a model. Live provider discovery did not expose additional distinct Australian/Indian identities; the pipeline does not relabel the same voice on another synthesis model as an independent speaker.

The versioned `hidden-ctc-v1` feature concatenates the original layer-7 representation with the **full observed phonetic log-probability vector**, pooled over the same aligned frames. No expected sound ID, accent ID, target one-hot vector or accent-specific score offset is appended. Preparation and prediction share `sound_feature`; checkpoints and caches record the representation, and mismatches fail closed. Legacy checkpoints default to `hidden7`, retaining their original prediction behavior. Balanced training/banks remain; v3 also balances stress-training sampling and each sound’s shared calibration/duration distributions across represented accents. Calibration uses the inverse weighted empirical distribution (one equal total mass per accent), producing one common scale for all speakers. V3 epoch selection uses macro-average validation sound accuracy with equal weight for each accent group.

```sh
node scripts/reference-corpus.mjs plan --config training/reference-corpus-v3.json
node scripts/reference-corpus.mjs generate --config training/reference-corpus-v3.json --concurrency 16 --requests-per-second 4 --confirm-spend --max-usd 7
uv run --project training python training/comparison.py prepare --config training/reference-corpus-v3.json --batch-size 16 --workers 8
uv run --project training python training/audit_corpus.py --config training/reference-corpus-v3.json --device cpu --threads 8 --batch-size 8 --workers 4
uv run --project training python training/comparison.py train --config training/reference-corpus-v3.json --output artifacts/pronunciation/runs/accent-candidate-1 --epochs 30 --device auto --threads 16 --batch-size 2048
uv run --project training python training/comparison.py evaluate --config training/reference-corpus-v3.json --model artifacts/pronunciation/runs/accent-candidate-1/model.pt --output artifacts/pronunciation/runs/accent-candidate-1/validation.json
```

The generator's batch ceiling describes the full configuration estimate (including already paid/reused audio). The ledger/provider guards still check only missing requests against the cumulative project cap. Reusing a corpus verifies model, voice, script and audio hashes before copying and records its source. `auditFile` isolates v3 audit state from v2; matching old audit rows may be reused only with matching raw audio hashes.

After validation and actual inference checks, freeze the checkpoint, then evaluate it and v2 on exactly the same fresh test recordings. Baseline transfer evaluation requires explicit `--transfer`; it does not update the checkpoint. Only the documented `hidden-ctc-v1` → `hidden7` prefix conversion is allowed, preserving the last three relative stress features separately. Different phonetic label systems are rejected. Normal evaluation still requires matching training corpus/version identities. Reports distinguish training and evaluation manifest hashes.

```sh
uv run --project training python training/comparison.py evaluate --config training/reference-corpus-v3.json --model training/checkpoints/blended-english-v2/model.pt --output artifacts/pronunciation/runs/accent-candidate-1/baseline-validation.json --transfer
```

See the new model card for actual paired results, budget, timings and limits. Synthetic sound discrimination and reference similarity remain distinct from human pronunciation-score validity; raw audio is not shipped in the PWA. The subsequently authorized required v3 browser model is documented separately.

## Rebuild the browser export

```sh
uv sync --project training --locked --group export
uv run --project training --group export python training/export_browser.py
```

This converts the existing accepted checkpoint and pinned encoder without fitting or paid generation. It writes versioned model weight parts/metadata under `public/models/blended-english-v3/` and the pinned application manifest `src/speech/comparison-manifest.json`. Preserve the original model and training corpus. Export dependencies are isolated in the locked `export` group; the historical fitting lock hash remains recorded in v3 provenance at commit `8827348`. Validate export identities and browser/Python agreement before shipping a rebuilt pack. The required pack downloads automatically into its own verified cache; no opt-in or word-match grade fallback.
